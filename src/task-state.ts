import { recoverInterruptedTask } from "./recovery.ts";
import { reconcileTaskState, type TaskStateSource } from "./task-reconciliation.ts";
import type { HarnessTask } from "./task.ts";

export type TaskResumeRequest =
  | { ok: true; reference?: string; source?: TaskStateSource }
  | { ok: false; message: string };

export type SessionTaskResolution =
  | { status: "ready"; task: HarnessTask }
  | { status: "conflict"; task: HarnessTask; message: string };

export type TaskResumeResolution =
  | { status: "ready"; task: HarnessTask; source: TaskStateSource; path: string }
  | { status: "conflict"; message: string }
  | { status: "cancelled"; message: string }
  | { status: "invalid-session"; message: string };

export function parseTaskResumeRequest(args: string): TaskResumeRequest {
  const sourceMatch = args.match(/(?:^|\s)--source(?:=|\s+)(session|artifact)(?=\s|$)/);
  if (args.includes("--source") && !sourceMatch) {
    return { ok: false, message: "Uso: /harness-task-resume [id] [--source session|artifact]" };
  }
  const source = sourceMatch?.[1] as TaskStateSource | undefined;
  const reference = (sourceMatch ? args.replace(sourceMatch[0], " ") : args).trim() || undefined;
  return { ok: true, reference, source };
}

export async function persistTaskArtifact(task: HarnessTask, blockedTaskId?: string): Promise<HarnessTask> {
  if (task.route !== "task") return task;
  if (blockedTaskId === task.id) {
    throw new Error(`La tarea ${task.id} tiene estados divergentes. Resuelve primero con /harness-task-resume ${task.id} --source session|artifact.`);
  }
  const { writeTaskArtifact } = await import("./task-artifact.ts");
  const path = await writeTaskArtifact(task);
  if (task.artifactPath === path) return task;
  const withPath = { ...task, artifactPath: path };
  await writeTaskArtifact(withPath);
  return withPath;
}

export class TaskStateCoordinator {
  private blockedTaskId?: string;

  reset(): void {
    this.blockedTaskId = undefined;
  }

  async sync(task: HarnessTask): Promise<HarnessTask> {
    return persistTaskArtifact(task, this.blockedTaskId);
  }

  async prepareSessionTask(cwd: string, task: HarnessTask, recoverInterrupted: boolean): Promise<SessionTaskResolution> {
    let resolved = task;
    if (task.route === "task" && task.artifactPath) {
      try {
        const { readTaskArtifact } = await import("./task-artifact.ts");
        const recovered = await readTaskArtifact(cwd, task.id);
        const reconciliation = reconcileTaskState(task, { ...recovered.task, artifactPath: recovered.path });
        if (reconciliation.status === "conflict") {
          this.blockedTaskId = task.id;
          return { status: "conflict", task, message: reconciliation.message };
        }
        resolved = { ...reconciliation.task, artifactPath: recovered.path };
      } catch (error) {
        this.blockedTaskId = task.id;
        const detail = error instanceof Error ? error.message : String(error);
        return {
          status: "conflict",
          task,
          message: `No se pudo reconciliar la sesión con el artefacto de ${task.id}: ${detail} Usa /harness-task-resume ${task.id} --source session para recrearlo explícitamente.`,
        };
      }
    }
    this.blockedTaskId = undefined;
    return { status: "ready", task: recoverInterrupted ? recoverInterruptedTask(resolved) : resolved };
  }

  async resume(input: {
    cwd: string;
    sessionTask?: HarnessTask;
    request: TaskResumeRequest & { ok: true };
    recoverInterrupted: boolean;
  }): Promise<TaskResumeResolution> {
    const { request, sessionTask } = input;
    if (request.source === "session") {
      if (!sessionTask || sessionTask.route !== "task" || (request.reference && request.reference !== sessionTask.id && request.reference !== `${sessionTask.id}.md`)) {
        return {
          status: "invalid-session",
          message: request.reference
            ? `La sesión no contiene la tarea ${request.reference}; no se puede elegir como fuente.`
            : "La sesión no contiene una tarea que pueda usarse como fuente.",
        };
      }
      this.blockedTaskId = undefined;
      const task = input.recoverInterrupted ? recoverInterruptedTask(sessionTask) : sessionTask;
      const persisted = await this.sync(task);
      return { status: "ready", task: persisted, source: "session", path: persisted.artifactPath! };
    }

    const { readTaskArtifact } = await import("./task-artifact.ts");
    const recovered = await readTaskArtifact(input.cwd, request.reference);
    if (recovered.task.phase === "cancelled") {
      return { status: "cancelled", message: `La tarea ${recovered.task.id} está cancelada y no se puede reactivar. Crea una tarea nueva.` };
    }
    const reconciliation = sessionTask?.id === recovered.task.id
      ? reconcileTaskState(sessionTask, { ...recovered.task, artifactPath: recovered.path }, request.source)
      : { status: "selected" as const, task: recovered.task, source: "artifact" as const };
    if (reconciliation.status === "conflict") {
      this.blockedTaskId = recovered.task.id;
      return { status: "conflict", message: reconciliation.message };
    }
    this.blockedTaskId = undefined;
    const selected = { ...reconciliation.task, artifactPath: recovered.path };
    const task = input.recoverInterrupted ? recoverInterruptedTask(selected) : selected;
    const persisted = await this.sync(task);
    return { status: "ready", task: persisted, source: reconciliation.source, path: recovered.path };
  }
}
