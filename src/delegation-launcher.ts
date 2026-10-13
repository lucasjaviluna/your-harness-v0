import type { DelegatedTask, DelegationEvent } from "./delegation.ts";
import { DelegationRegistry } from "./delegation-store.ts";
import {
  runDelegationProcess,
  validateDelegationExecutionPlan,
  type DelegationExecutionPlan,
  type DelegationExecutionResult,
  type DelegationProcessRunner,
} from "./delegation-executor.ts";

export type DelegationLauncherOptions = {
  enabled: boolean;
  registry: DelegationRegistry;
  runner: DelegationProcessRunner;
  persist: () => Promise<void>;
  now?: () => string;
};

/**
 * Opt-in bridge between a registered task and the process runner.
 * It deliberately does not create tasks, worktrees, prompts or session commands.
 */
export function createDelegationLauncher(options: DelegationLauncherOptions) {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async launch(task: DelegatedTask, plan: DelegationExecutionPlan, signal?: AbortSignal): Promise<DelegationExecutionResult> {
      if (!options.enabled) throw new Error("La delegación real está deshabilitada.");
      if (task.status !== "queued") throw new Error("Solo se puede lanzar una tarea delegada en estado queued.");
      if (task.id !== plan.taskId || task.parentTaskId !== plan.parentTaskId) {
        throw new Error("La tarea y el plan de delegación no coinciden.");
      }
      const validation = validateDelegationExecutionPlan(plan);
      if (!validation.valid) throw new Error(validation.reason);
      const registered = options.registry.snapshot().tasks.find((candidate) => candidate.id === task.id);
      if (!registered) throw new Error(`La tarea delegada ${task.id} no está registrada.`);

      options.registry.recordEvent(startedEvent(task.id, now()));
      await options.persist();

      const result = await runDelegationProcess(plan, options.runner, signal);
      const terminalEvent = resultEvent(result, now());
      try {
        options.registry.recordEvent(terminalEvent);
        await options.persist();
      } catch {
        // The in-memory registry has advanced, but the durable store remains at running;
        // a later restart reconciliation will classify that persisted execution as lost.
        return {
          taskId: task.id,
          status: "lost",
          summary: "La tarea hija terminó, pero no se pudo persistir su resultado.",
          costCents: result.costCents,
        };
      }
      return result;
    },
  };
}

function startedEvent(taskId: string, timestamp: string): DelegationEvent {
  return { taskId, type: "started", timestamp, summary: "La tarea hija inició su ejecución." };
}

function resultEvent(result: DelegationExecutionResult, timestamp: string): DelegationEvent {
  const type: DelegationEvent["type"] = result.status === "succeeded"
    ? "completed"
    : result.status === "cancelled"
      ? "cancelled"
      : result.status === "lost"
        ? "lost"
        : "failed";
  return { taskId: result.taskId, type, timestamp, summary: result.summary };
}
