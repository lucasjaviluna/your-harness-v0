import type { DelegatedTask, DelegationEvent } from "./delegation.ts";

export function formatDelegationOverview(
  tasks: readonly DelegatedTask[],
  events: readonly DelegationEvent[],
): string {
  const lines = [
    "pi-harness delegation",
    "Ejecución: deshabilitada; este diagnóstico es read-only.",
    tasks.length ? `Tareas registradas: ${tasks.length}` : "Tareas registradas: ninguna",
  ];
  for (const task of tasks) {
    lines.push(`- ${task.id}: ${task.status} · padre ${task.parentTaskId} · modo ${task.mode}`);
    if (task.summary) lines.push(`  Resumen: ${task.summary}`);
    if (task.worktree) {
      lines.push(`  Worktree: ${task.worktree.state} · ${task.worktree.path}`);
      if (task.worktree.reviewRequired) lines.push("  Revisión requerida: verificar el worktree antes de continuar.");
      if (task.worktree.reviewDecision) lines.push(`  Decisión registrada: ${task.worktree.reviewDecision} (${task.worktree.reviewedAt ?? "sin fecha"}).`);
    }
  }
  if (events.length) {
    lines.push(`Eventos recientes: ${events.slice(-5).map((event) => `${event.type}/${event.taskId}`).join(", ")}`);
  } else {
    lines.push("Eventos recientes: ninguno");
  }
  return lines.join("\n");
}
