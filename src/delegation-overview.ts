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
  }
  if (events.length) {
    lines.push(`Eventos recientes: ${events.slice(-5).map((event) => `${event.type}/${event.taskId}`).join(", ")}`);
  } else {
    lines.push("Eventos recientes: ninguno");
  }
  return lines.join("\n");
}
