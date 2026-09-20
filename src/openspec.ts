import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HarnessTask, HumanGate, OpenSpecState, OpenSpecStep } from "./task.ts";

const execFileAsync = promisify(execFile);

export type OpenSpecDetection = OpenSpecState & {
  projectDirectory: string;
  activeChanges: string[];
  initCommand: string;
  findings: string[];
};

const WORKFLOW_IDS: Array<OpenSpecStep> = ["propose", "apply", "verify", "sync", "archive"];

async function directoryEntries(path: string): Promise<string[]> {
  try { return await readdir(path); } catch { return []; }
}

async function directoryExists(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

export async function detectOpenSpec(cwd: string, options: { probeCli?: boolean } = {}): Promise<OpenSpecDetection> {
  const projectDirectory = join(cwd, "openspec");
  const configuredProject = await directoryExists(projectDirectory);
  const promptDirectory = join(cwd, ".pi", "prompts");
  const skillDirectory = join(cwd, ".pi", "skills");
  const promptFiles = (await directoryEntries(promptDirectory)).filter((file) => /^opsx-(propose|apply|verify|sync|archive)\./i.test(file));
  const skillDirectories = (await directoryEntries(skillDirectory)).filter((file) => /^openspec-(propose|apply-change|verify-change|sync-specs|archive-change)$/i.test(file));
  const cliAvailable = options.probeCli === false ? false : await execFileAsync("openspec", ["--version"], { cwd, windowsHide: true }).then(() => true).catch(() => false);
  const commands: OpenSpecDetection["commands"] = {};
  if (promptFiles.length > 0) {
    const byId = (id: string) => promptFiles.find((file) => file.toLowerCase().startsWith(`opsx-${id}.`));
    if (byId("propose")) commands.propose = "/opsx-propose";
    if (byId("apply")) commands.apply = "/opsx-apply";
    if (byId("verify")) commands.verify = "/opsx-verify";
    if (byId("sync")) commands.sync = "/opsx-sync";
    if (byId("archive")) commands.archive = "/opsx-archive";
  } else if (skillDirectories.length > 0) {
    const has = (name: string) => skillDirectories.includes(name);
    if (has("openspec-propose")) commands.propose = "/openspec-propose";
    if (has("openspec-apply-change")) commands.apply = "/openspec-apply-change";
    if (has("openspec-verify-change")) commands.verify = "/openspec-verify-change";
    if (has("openspec-sync-specs")) commands.sync = "/openspec-sync-specs";
    if (has("openspec-archive-change")) commands.archive = "/openspec-archive-change";
  }
  const configured = configuredProject || Object.keys(commands).length > 0;
  const commandStyle: OpenSpecState["commandStyle"] = Object.keys(commands).length > 0
    ? promptFiles.length > 0 ? "prompt" : "skill"
    : "unavailable";
  const changesDirectory = join(projectDirectory, "changes");
  const activeChanges = (await directoryEntries(changesDirectory)).filter((name) => name !== "archive");
  const findings = [
    configuredProject ? "Se encontró openspec/." : "No se encontró openspec/.",
    promptFiles.length ? `Prompts Pi detectados: ${promptFiles.join(", ")}.` : "No se encontraron prompts OpenSpec para Pi.",
    skillDirectories.length ? `Skills OpenSpec detectadas: ${skillDirectories.join(", ")}.` : "No se encontraron skills OpenSpec para Pi.",
    cliAvailable ? "CLI openspec disponible." : "CLI openspec no disponible en PATH.",
  ];
  return {
    configured, cliAvailable, commandStyle, commands, projectDirectory, activeChanges, findings,
    initCommand: cliAvailable ? "openspec init --tools pi" : "npm install -g @fission-ai/openspec@latest && openspec init --tools pi",
  };
}

export function createOpenSpecAuthorizationGate(task: HarnessTask, question: string, evidence: string[]): HumanGate {
  return {
    id: `gate-${Date.now().toString(36)}`, kind: "authorize", reason: "OpenSpec requiere aprobación humana antes de avanzar al siguiente paso.",
    question, options: ["approve", "reject", "revise", "cancel"], evidence, blocksProgress: true,
  };
}

export function createOpenSpecReviewGate(task: HarnessTask, evidence: string[]): HumanGate {
  return {
    id: `gate-${Date.now().toString(36)}`, kind: "review", reason: "La implementación SDD terminó y requiere revisión humana de cambios y verificaciones.",
    question: "¿Apruebas los cambios implementados por OpenSpec para continuar con verify, sync y archive?",
    options: ["approve", "revise", "cancel"], evidence, blocksProgress: true,
  };
}

export function nextOpenSpecStep(step: OpenSpecStep | undefined): OpenSpecStep {
  if (step === "proposed") return "apply";
  if (step === "applied") return "verify";
  if (step === "verify") return "sync";
  if (step === "sync") return "archive";
  return "complete";
}

export function buildOpenSpecDelegation(task: HarnessTask, detection: OpenSpecDetection, step: OpenSpecStep): string | undefined {
  const command = detection.commands[step];
  if (!command) return undefined;
  if (step === "propose") {
    return `${command} ${task.prompt}\n\nPi-harness: prepara la propuesta OpenSpec, pero no ejecutes apply. Conserva el nombre del change y entrega un resumen de los artefactos creados para revisión humana.`;
  }
  return `${command}\n\nPi-harness: ejecuta únicamente el paso ${step} sobre el change OpenSpec aprobado. Informa los archivos y verificaciones reales, y detente si falta información o autorización.`;
}

export function extractOpenSpecChange(text: string, activeChanges: string[]): string | undefined {
  const explicit = text.match(/(?:change|cambio)\s*[:=]\s*[`']?([a-z0-9][a-z0-9-]*)/i)?.[1];
  return explicit || (activeChanges.length === 1 ? activeChanges[0] : undefined);
}

export function extractOpenSpecArtifacts(cwd: string, change?: string): string[] {
  if (!change) return [];
  return [
    `${cwd}/openspec/changes/${change}/proposal.md`,
    `${cwd}/openspec/changes/${change}/design.md`,
    `${cwd}/openspec/changes/${change}/tasks.md`,
  ];
}

export async function existingOpenSpecArtifacts(cwd: string, change?: string): Promise<string[]> {
  const artifacts = extractOpenSpecArtifacts(cwd, change);
  const existing: string[] = [];
  for (const artifact of artifacts) {
    try { await access(artifact); existing.push(artifact); } catch { /* proposal may use a custom artifact set */ }
  }
  return existing;
}

export function workflowIds(): OpenSpecStep[] { return [...WORKFLOW_IDS]; }
