import type { OpenSpecDetection } from "./openspec.ts";
import type { RepositorySnapshot } from "./simple.ts";
import { unresolvedGate, type HarnessTask } from "./task.ts";

/** Read-only summary intended for the TUI and headless command output. */
export function formatHarnessOverview(
  task: HarnessTask | undefined,
  snapshot: RepositorySnapshot,
  openSpec: OpenSpecDetection,
): string {
  const gate = task ? unresolvedGate(task) : undefined;
  return [
    "pi-harness overview",
    task ? `Tarea: ${task.id}` : "Tarea: ninguna activa",
    task ? `Estado: ${task.phase} · ruta ${task.route ?? "sin evaluar"}` : "Estado: sin tarea activa",
    task ? `Próximo paso: ${nextStep(task)}` : "Próximo paso: iniciar una tarea con /harness-work",
    gate ? `Gate pendiente: ${gate.question}` : "Gate pendiente: ninguno",
    `Git: ${snapshot.available ? "disponible" : "no disponible"}`,
    `Cambios: ${snapshot.files.length ? snapshot.files.join(", ") : "ninguno"}`,
    `OpenSpec: ${openSpec.activeChanges.length ? openSpec.activeChanges.join(", ") : "sin changes activos"}`,
    snapshot.error ? `Error Git: ${snapshot.error}` : "",
  ].filter(Boolean).join("\n");
}

function nextStep(task: HarnessTask): string {
  if (task.phase === "awaiting-approval") return "esperar aprobación humana";
  if (task.phase === "awaiting-review") return "revisar el resultado y el diff";
  if (task.phase === "clarifying") return "responder la aclaración pendiente";
  if (task.phase === "blocked") return "resolver el bloqueo registrado";
  if (task.phase === "done" || task.phase === "cancelled") return "crear una tarea nueva si corresponde";
  return task.result?.nextStep ?? "continuar desde el estado actual";
}
