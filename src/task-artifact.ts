import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hydrateHarnessTask, isHarnessTask, type HarnessTask } from "./task.ts";

export const TASK_ARTIFACT_DIRECTORY = ".harness/tasks";

function artifactPath(cwd: string, taskId: string): string {
  return join(resolve(cwd), TASK_ARTIFACT_DIRECTORY, `${taskId}.md`);
}

function extractSection(content: string, title: string): string | undefined {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) return undefined;
  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) break;
    section.push(lines[index]);
  }
  return section.join("\n").trim();
}

function snapshotTask(task: HarnessTask): HarnessTask {
  return {
    ...task,
    context: task.context ? {
      ...task.context,
      instructionFiles: task.context.instructionFiles.map(({ path }) => ({ path, content: "" })),
    } : undefined,
  };
}

function defaultTasks(task: HarnessTask): string {
  const approval = task.phase === "planning" ? "[x] Confirmar alcance y plan" : "[ ] Confirmar alcance y plan";
  return [approval, "[ ] Implementar el cambio", "[ ] Ejecutar verificaciones", "[ ] Revisar resultado y cerrar"].join("\n");
}

function decisions(task: HarnessTask): string {
  const entries = task.humanGates.filter((gate) => gate.decision).map((gate) => {
    const decision = gate.decision!;
    return `- ${gate.kind}: **${decision.value}** — ${decision.note ?? "sin nota"} (${decision.decidedAt})`;
  });
  return entries.length ? entries.join("\n") : "- No hay decisiones registradas.";
}

function evidence(task: HarnessTask): string {
  const entries = task.assessment?.evidence ?? [];
  return entries.length ? entries.map((item) => `- ${item}`).join("\n") : "- No hay evidencia registrada.";
}

export function renderTaskArtifact(task: HarnessTask, previousContent?: string): string {
  const preservedTasks = previousContent ? extractSection(previousContent, "Tasks") : undefined;
  const preservedDecisions = previousContent ? extractSection(previousContent, "Decisions") : undefined;
  const preservedEvidence = previousContent ? extractSection(previousContent, "Evidence") : undefined;
  const state = JSON.stringify(snapshotTask(task), null, 2);
  return [
    `# ${task.id}`,
    "",
    `- Status: **${task.phase}**`,
    `- Route: **${task.route ?? "task"}**`,
    `- Profile: **${task.profile}**`,
    `- Created: ${task.createdAt}`,
    "",
    "<!-- pi-harness-state",
    state,
    "-->",
    "",
    "## Objective",
    "",
    task.prompt,
    "",
    "## Scope",
    "",
    task.scope ?? task.prompt,
    "",
    "## Constraints",
    "",
    "- Mantener el alcance aprobado.",
    "- No declarar la tarea terminada sin evidencia de verificación.",
    "",
    "## Tasks",
    "",
    preservedTasks || defaultTasks(task),
    "",
    "## Decisions",
    "",
    preservedDecisions || decisions(task),
    "",
    "## Evidence",
    "",
    preservedEvidence || evidence(task),
    "",
    "## Progress",
    "",
    `Fase actual: **${task.phase}**.`,
    task.result ? `Resultado: **${task.result.status}** — ${task.result.summary}` : "Todavía no hay resultado final.",
    "",
    "## Next step",
    "",
    nextStep(task),
    "",
  ].join("\n");
}

function nextStep(task: HarnessTask): string {
  if (task.phase === "awaiting-approval") return "Esperar aprobación o revisión del alcance y plan mediante `/harness-decide`.";
  if (task.phase === "planning") return "Preparar la implementación y actualizar las tareas del plan.";
  if (task.phase === "blocked") return "Resolver el bloqueo registrado antes de continuar.";
  if (task.phase === "done") return "Tarea cerrada; conservar este archivo como historial breve.";
  return "Continuar desde el último estado persistido.";
}

export async function writeTaskArtifact(task: HarnessTask): Promise<string> {
  const path = artifactPath(task.cwd, task.id);
  await mkdir(join(resolve(task.cwd), TASK_ARTIFACT_DIRECTORY), { recursive: true });
  let previous: string | undefined;
  try {
    previous = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(path, renderTaskArtifact(task, previous), "utf8");
  return path;
}

export async function findTaskArtifact(cwd: string, reference?: string): Promise<string> {
  const directory = join(resolve(cwd), TASK_ARTIFACT_DIRECTORY);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".md"));
  if (!files.length) throw new Error("No hay tareas ligeras en .harness/tasks.");
  const match = reference
    ? files.find((file) => file === reference || file === `${reference}.md` || file.startsWith(`${reference}.`))
    : files[files.length - 1];
  if (!match) throw new Error(`No se encontró la tarea ligera: ${reference}`);
  return join(directory, match);
}

export async function readTaskArtifact(cwd: string, reference?: string): Promise<{ task: HarnessTask; path: string }> {
  const path = await findTaskArtifact(cwd, reference);
  const content = await readFile(path, "utf8");
  const start = content.indexOf("<!-- pi-harness-state");
  const end = content.indexOf("-->", start);
  if (start < 0 || end < 0) throw new Error("El artefacto no contiene estado de pi-harness válido.");
  const raw = content.slice(start + "<!-- pi-harness-state".length, end).trim();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("El estado JSON del artefacto está corrupto.");
  }
  if (!isHarnessTask(value)) throw new Error("El estado del artefacto no representa una tarea válida.");
  return { task: hydrateHarnessTask(value), path };
}
