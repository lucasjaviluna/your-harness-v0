import type { DelegatedTask, DelegationIsolation, DelegationMode, DelegationOwnership } from "./delegation.ts";
import { DelegationRegistry } from "./delegation-store.ts";
import { createDelegationLauncher, type DelegationLauncherOptions } from "./delegation-launcher.ts";
import { validateDelegationExecutionPlan, type DelegationExecutionPlan, type DelegationExecutionResult } from "./delegation-executor.ts";

export type DelegationSessionRequest = {
  taskId: string;
  parentTaskId: string;
  mode: DelegationMode;
  depth: number;
  isolation: DelegationIsolation;
  workspaceRoot: string;
  workingDirectory: string;
  ownership?: DelegationOwnership;
  worktreePath?: string;
  timeoutMs: number;
  budgetCents: number;
};

export type QueuedDelegation = {
  task: DelegatedTask;
  plan: DelegationExecutionPlan;
};

export type DelegationSessionControllerOptions = Omit<DelegationLauncherOptions, "registry"> & {
  registry: DelegationRegistry;
  now?: () => string;
};

/** Session-facing coordinator. It creates queued state, but launch still requires HIL approval. */
export function createDelegationSessionController(options: DelegationSessionControllerOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  const launcher = createDelegationLauncher(options);

  return {
    async queue(request: DelegationSessionRequest): Promise<QueuedDelegation> {
      const plan: DelegationExecutionPlan = {
        taskId: request.taskId,
        parentTaskId: request.parentTaskId,
        isolation: request.isolation,
        workspaceRoot: request.workspaceRoot,
        workingDirectory: request.workingDirectory,
        ownership: request.ownership,
        worktreePath: request.worktreePath,
        timeoutMs: request.timeoutMs,
        budgetCents: request.budgetCents,
      };
      const validation = validateDelegationExecutionPlan(plan);
      if (!validation.valid) throw new Error(validation.reason);
      const timestamp = now();
      const task: DelegatedTask = {
        id: request.taskId,
        parentTaskId: request.parentTaskId,
        status: "queued",
        mode: request.mode,
        depth: request.depth,
        ...(request.ownership ? { scope: request.ownership.scope, ownership: request.ownership } : {}),
        executionPlan: plan,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      options.registry.createTask(task);
      await options.persist();
      return { task: { ...task }, plan };
    },

    async launch(queued: QueuedDelegation, humanApproved: boolean, parentSignal?: AbortSignal): Promise<DelegationExecutionResult> {
      if (!humanApproved) throw new Error("La delegación requiere aprobación humana antes de iniciar.");
      return launcher.launch(queued.task, queued.plan, parentSignal);
    },

    async launchPersisted(task: DelegatedTask, humanApproved: boolean, parentSignal?: AbortSignal): Promise<DelegationExecutionResult> {
      if (!humanApproved) throw new Error("La delegación requiere aprobación humana antes de iniciar.");
      if (!task.executionPlan) throw new Error(`La tarea delegada ${task.id} no tiene un plan recuperable.`);
      return launcher.launch(task, task.executionPlan, parentSignal);
    },
  };
}
