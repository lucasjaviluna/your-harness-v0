import type { HarnessTask, HumanGate } from "./task.ts";

export function recoverInterruptedTask(task: HarnessTask): HarnessTask {
  if (!["implementing", "verifying"].includes(task.phase)) return task;
  const gate: HumanGate = {
    id: `gate-${Date.now().toString(36)}`, kind: "recover",
    reason: "La sesión terminó mientras la tarea estaba en ejecución y requiere una decisión para continuar.",
    question: "¿Quieres recuperar la tarea y volver a planificación?", options: ["approve", "cancel"],
    evidence: [`Fase interrumpida: ${task.phase}`, `Ruta: ${task.route ?? "sin evaluar"}`, `Prompt: ${task.prompt}`], blocksProgress: true,
  };
  return { ...task, phase: "awaiting-approval", humanGates: [...task.humanGates, gate] };
}

export function isActiveTask(task: HarnessTask | undefined): boolean {
  return Boolean(task && !["done", "cancelled", "failed", "blocked"].includes(task.phase));
}
