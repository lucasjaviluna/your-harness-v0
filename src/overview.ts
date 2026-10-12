import { unresolvedGate, type HarnessTask } from "./task.ts";
import { createWorkspaceSnapshot, type WorkspaceSnapshot } from "./workspace.ts";

/** Read-only summary intended for the TUI and headless command output. */
export function formatHarnessOverview(
  task: HarnessTask | undefined,
  repository: WorkspaceSnapshot["repository"],
  openSpec: WorkspaceSnapshot["openSpec"],
  delegatedTasks: WorkspaceSnapshot["delegatedTasks"] = [],
): string {
  return formatWorkspaceSnapshot(createWorkspaceSnapshot(task, repository, openSpec, delegatedTasks));
}

export function formatWorkspaceSnapshot(workspace: WorkspaceSnapshot): string {
  const { task, repository: snapshot, openSpec, delegatedTasks } = workspace;
  const gate = task ? unresolvedGate(task) : undefined;
  const lines = [
    "pi-harness overview",
    task ? `Tarea: ${task.id}` : "Tarea: ninguna activa",
    task ? `Estado: ${task.phase} · ruta ${task.route ?? "sin evaluar"}` : "Estado: sin tarea activa",
    task ? `Próximo paso: ${nextStep(task)}` : "Próximo paso: iniciar una tarea con /harness-work",
    gate ? `Gate pendiente: ${gate.question}` : "Gate pendiente: ninguno",
    `Git: ${snapshot.available ? "disponible" : "no disponible"}`,
    `Cambios: ${snapshot.files.length ? snapshot.files.join(", ") : "ninguno"}`,
    `OpenSpec: ${openSpec.activeChanges.length ? openSpec.activeChanges.join(", ") : "sin changes activos"}`,
    snapshot.error ? `Error Git: ${snapshot.error}` : "",
  ];
  if (delegatedTasks.length) {
    lines.push(`Tareas delegadas: ${delegatedTasks.map((child) => `${child.id} (${child.status})`).join(", ")}`);
  } else {
    lines.push("Tareas delegadas: ninguna");
  }
  return lines.filter(Boolean).join("\n");
}

function nextStep(task: HarnessTask): string {
  if (task.phase === "awaiting-approval") return "esperar aprobación humana";
  if (task.phase === "awaiting-review") return "revisar el resultado y el diff";
  if (task.phase === "clarifying") return "responder la aclaración pendiente";
  if (task.phase === "blocked") return "resolver el bloqueo registrado";
  if (task.phase === "done" || task.phase === "cancelled") return "crear una tarea nueva si corresponde";
  return task.result?.nextStep ?? "continuar desde el estado actual";
}
