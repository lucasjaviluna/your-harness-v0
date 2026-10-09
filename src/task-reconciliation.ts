import type { HarnessTask } from "./task.ts";

export type TaskStateSource = "session" | "artifact";

export type TaskReconciliation =
  | { status: "matched"; task: HarnessTask; source: "artifact" }
  | { status: "selected"; task: HarnessTask; source: TaskStateSource }
  | { status: "conflict"; session: HarnessTask; artifact: HarnessTask; message: string };

function comparableTask(task: HarnessTask): HarnessTask {
  return {
    ...task,
    artifactPath: undefined,
    context: task.context ? {
      ...task.context,
      instructionFiles: task.context.instructionFiles.map(({ path }) => ({ path, content: "" })),
    } : undefined,
  };
}

export function reconcileTaskState(
  session: HarnessTask,
  artifact: HarnessTask,
  preferredSource?: TaskStateSource,
): TaskReconciliation {
  if (session.id !== artifact.id) {
    throw new Error(`No se pueden reconciliar tareas distintas (${session.id} y ${artifact.id}).`);
  }
  if (preferredSource) {
    return { status: "selected", task: preferredSource === "session" ? session : artifact, source: preferredSource };
  }
  if (JSON.stringify(comparableTask(session)) === JSON.stringify(comparableTask(artifact))) {
    return { status: "matched", task: artifact, source: "artifact" };
  }
  return {
    status: "conflict",
    session,
    artifact,
    message: [
      `La sesión y el artefacto de ${session.id} no coinciden.`,
      `Sesión: fase ${session.phase}; artefacto: fase ${artifact.phase}.`,
      `Elige explícitamente con /harness-task-resume ${session.id} --source session|artifact.`,
    ].join(" "),
  };
}
