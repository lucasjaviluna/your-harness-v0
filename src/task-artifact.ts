import { lstat, mkdir, readFile, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { hydrateHarnessTask, isHarnessTask, type HarnessTask } from "./task.ts";
import { formatPlanDetails } from "./plan.ts";

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

function renderDecisions(task: HarnessTask, previous?: string): string {
  const current = decisions(task);
  if (!previous || previous === "- No hay decisiones registradas.") return current;
  if (current === "- No hay decisiones registradas.") return previous;
  const previousLines = new Set(previous.split(/\r?\n/));
  const added = current.split("\n").filter((line) => !previousLines.has(line));
  return [previous, ...added].join("\n");
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
    ...(task.phase === "cancelled" ? [`- Cancelled: ${[...task.humanGates].reverse().find((gate) => gate.decision?.value === "cancel")?.decision?.decidedAt ?? "fecha no disponible"}`] : []),
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
    "## Plan",
    "",
    task.plan ? formatPlanDetails(task.plan) : "No hay un plan generado todavía.",
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
    renderDecisions(task, preservedDecisions),
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
  if (task.phase === "cancelled") return "Sin próximos pasos. Si se retoma la solicitud, crear una tarea nueva.";
  if (task.phase === "awaiting-approval") return "Esperar aprobación o revisión del alcance y plan mediante `/harness-decide`.";
  if (task.phase === "planning") return "Preparar la implementación y actualizar las tareas del plan.";
  if (task.phase === "blocked") return "Resolver el bloqueo registrado antes de continuar.";
  if (task.phase === "done") return "Tarea cerrada; conservar este archivo como historial breve.";
  return "Continuar desde el último estado persistido.";
}

export async function deleteCancelledTaskArtifact(task: HarnessTask): Promise<string> {
  if (task.phase !== "cancelled" || task.route !== "task") {
    throw new Error("Solo se puede eliminar el artefacto de una tarea ligera cancelada.");
  }
  if (!/^harness-\d{14}-[a-z0-9]+$/.test(task.id)) {
    throw new Error("El identificador de la tarea no es válido para eliminar un artefacto.");
  }
  const path = artifactPath(task.cwd, task.id);
  const expectedDirectory = join(await realpath(task.cwd), TASK_ARTIFACT_DIRECTORY);
  if (await realpath(dirname(path)) !== expectedDirectory) {
    throw new Error("El directorio del artefacto no coincide con el directorio de tareas esperado.");
  }
  if (task.artifactPath && resolve(task.artifactPath) !== path) {
    throw new Error("La ruta del artefacto no coincide con la tarea cancelada.");
  }
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("El artefacto debe ser un archivo regular, no un enlace.");
  const recovered = await readTaskArtifact(task.cwd, task.id);
  if (recovered.path !== path || recovered.task.id !== task.id || recovered.task.phase !== "cancelled" || resolve(recovered.task.cwd) !== resolve(task.cwd)) {
    throw new Error("El estado del archivo no coincide con la tarea cancelada.");
  }
  await unlink(path);
  return path;
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
