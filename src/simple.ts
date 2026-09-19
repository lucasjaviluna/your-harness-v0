import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HarnessTask, HumanGate, WorkResult } from "./task.ts";

const execFileAsync = promisify(execFile);

export type RepositorySnapshot = {
  available: boolean;
  status: string[];
  files: string[];
  error?: string;
};

export type SimpleAgentResult = WorkResult & { changedFiles: string[] };

function statusFiles(status: string[]): string[] {
  return status.map((line) => line.replace(/^..\s+/, "").trim()).filter(Boolean);
}

export async function captureRepositorySnapshot(cwd: string): Promise<RepositorySnapshot> {
  try {
    const result = await execFileAsync("git", ["status", "--short"], { cwd, windowsHide: true });
    const status = result.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    return { available: true, status, files: statusFiles(status) };
  } catch (error) {
    return { available: false, status: [], files: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export function chooseVerificationCommands(task: HarnessTask): string[] {
  const documented = task.context?.verificationCommands ?? [];
  if (documented.length > 0) return documented;
  if (task.context?.git.available) return ["git diff --check"];
  return [];
}

export function buildSimpleWorkflowPrompt(task: HarnessTask, baseline: RepositorySnapshot): string {
  const instructions = task.context?.instructionFiles.map((file) => file.path).join(", ") || "ninguna detectada";
  const checks = chooseVerificationCommands(task);
  return [
    "Ejecuta esta tarea siguiendo el workflow simple de pi-harness.",
    "",
    "Orden obligatorio:",
    "1. Entender: reformula el objetivo y confirma el alcance local.",
    "2. Inspeccionar: lee las instrucciones del repositorio y los archivos relevantes antes de editar.",
    "3. Editar: realiza únicamente el cambio solicitado; no modifiques archivos ajenos.",
    "4. Verificar: ejecuta las verificaciones proporcionales disponibles y registra el resultado real.",
    "5. Revisar diff: revisa git diff y detecta archivos modificados fuera del alcance.",
    "6. Resumir: entrega el resultado usando exactamente el bloque HARNESS_RESULT indicado abajo.",
    "",
    `Prompt original: ${task.prompt}`,
    `Instrucciones detectadas: ${instructions}`,
    `Archivos modificados antes de comenzar: ${baseline.files.join(", ") || "ninguno"}`,
    `Verificaciones sugeridas por el repositorio: ${checks.join(", ") || "ninguna; explica por qué no hay una disponible"}`,
    "",
    "No ejecutes acciones destructivas, no amplíes el alcance y no ocultes una verificación fallida.",
    "Si descubres impacto en contratos, datos, seguridad, arquitectura o varios módulos, detente y recomienda reencaminar a sdd.",
    "",
    "Formato final obligatorio:",
    "<HARNESS_RESULT>",
    "summary: <resumen breve>",
    "changed_files: <uno por línea, o none>",
    "checks:",
    "- [passed|failed|skipped] <comando> :: <evidencia>",
    "risks:",
    "- <riesgo o none>",
    "route: simple|sdd",
    "</HARNESS_RESULT>",
  ].join("\n");
}

function sectionLines(block: string, title: string): string[] {
  const marker = `${title}:`;
  const start = block.indexOf(marker);
  if (start < 0) return [];
  const content = block.slice(start + marker.length);
  const next = content.search(/\n(?:summary|changed_files|checks|risks|route):/);
  return content.slice(0, next < 0 ? content.length : next).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function parseSimpleAgentResult(text: string): SimpleAgentResult | undefined {
  const match = text.match(/<HARNESS_RESULT>\s*([\s\S]*?)\s*<\/HARNESS_RESULT>/i);
  if (!match) return undefined;
  const block = match[1];
  const summary = block.match(/^summary:\s*(.+)$/im)?.[1]?.trim() || "El agente terminó sin resumen.";
  const changedFiles = sectionLines(block, "changed_files").filter((line) => line.toLowerCase() !== "none");
  const checkLines = sectionLines(block, "checks");
  const checks = checkLines.map((line) => {
    const parsed = line.match(/^[-*]?\s*\[(passed|failed|skipped)\]\s+(.+?)(?:\s+::\s+(.+))?$/i);
    if (!parsed) return { status: "skipped" as const, evidence: line };
    return { command: parsed[2].trim(), status: parsed[1].toLowerCase() as "passed" | "failed" | "skipped", evidence: parsed[3]?.trim() || "sin evidencia adicional" };
  });
  const risks = sectionLines(block, "risks").filter((line) => line.replace(/^[-*]\s*/, "").toLowerCase() !== "none");
  const route = block.match(/^route:\s*(simple|sdd)\s*$/im)?.[1] ?? "simple";
  return { status: "needs-input", summary, artifacts: changedFiles, checks, nextStep: route === "sdd" ? "Reencaminar la tarea a sdd." : "Revisar el diff y aprobar el resultado.", risks, changedFiles };
}

export function reviewChangedFiles(baseline: RepositorySnapshot, current: RepositorySnapshot, reportedFiles: string[]): { changedFiles: string[]; unexpectedFiles: string[] } {
  const baselineSet = new Set(baseline.files);
  const changedFiles = current.files.filter((file) => !baselineSet.has(file));
  const reportedSet = new Set(reportedFiles);
  const unexpectedFiles = changedFiles.filter((file) => reportedFiles.length > 0 && !reportedSet.has(file));
  return { changedFiles, unexpectedFiles };
}

export function createSimpleReviewGate(task: HarnessTask, result: SimpleAgentResult, unexpectedFiles: string[]): HumanGate {
  const unexpected = unexpectedFiles.length ? ` Archivos fuera del reporte: ${unexpectedFiles.join(", ")}.` : "";
  return {
    id: `gate-${Date.now().toString(36)}`,
    kind: "review",
    reason: "La ruta simple terminó su implementación y requiere revisión humana del resultado y diff.",
    question: `¿Apruebas el resultado y el diff de la tarea?${unexpected}`,
    options: ["approve", "revise", "cancel"],
    evidence: [result.summary, ...result.checks.map((check) => `${check.command ?? "check"}: ${check.status} — ${check.evidence}`), ...result.risks],
    blocksProgress: true,
  };
}
