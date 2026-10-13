import { isAbsolute, relative, resolve } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import type { DelegationExecutionPlanRecord, DelegationIsolation, DelegationOwnership } from "./delegation.ts";

/** Execution contract for a future child-process adapter. It carries no prompt or credentials. */
export type DelegationExecutionPlan = DelegationExecutionPlanRecord;

export type DelegationProcessHandle = {
  taskId: string;
  pid?: number;
  workingDirectory: string;
  startedAt: string;
};

export type DelegationProcessCompletion = {
  exitCode: number | null;
  signal?: string;
  costCents: number;
};

export type DelegationChildProcess = {
  taskId: string;
  pid?: number;
  wait(): Promise<DelegationProcessCompletion>;
  terminate(reason: string): Promise<void>;
};

export type DelegationProcessRunner = {
  start(plan: DelegationExecutionPlan): Promise<DelegationChildProcess>;
};

export type DelegationLaunchSpec = {
  command: string;
  args: readonly string[];
};

/** A real runner with no shell and no captured child output. It is not wired to the launcher yet. */
export function createDelegationProcessRunner(spec: DelegationLaunchSpec): DelegationProcessRunner {
  if (!spec.command || spec.args.some((arg) => arg.includes("\u0000"))) throw new Error("El comando de delegación no es seguro.");
  return {
    async start(plan) {
      const child = spawn(spec.command, [...spec.args], { cwd: plan.workingDirectory, shell: false, stdio: ["ignore", "ignore", "ignore"] });
      const completion = new Promise<DelegationProcessCompletion>((resolveCompletion, rejectCompletion) => {
        child.once("error", (cause) => rejectCompletion(cause instanceof Error ? cause : new Error(String(cause))));
        child.once("close", (exitCode, signal) => resolveCompletion({ exitCode, signal: signal ?? undefined, costCents: 0 }));
      });
      const waitForClose = async (milliseconds: number): Promise<void> => {
        await Promise.race([
          completion.then(() => undefined, () => undefined),
          new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds)),
        ]);
      };
      return {
        taskId: plan.taskId,
        pid: child.pid,
        wait: async () => completion,
        terminate: async () => {
          if (child.exitCode !== null) return;
          child.kill("SIGTERM");
          await waitForClose(250);
          if (child.exitCode === null) {
            child.kill("SIGKILL");
            await waitForClose(250);
          }
        },
      };
    },
  };
}

export type DelegationExecutionResult = {
  taskId: string;
  status: "succeeded" | "failed" | "cancelled" | "lost";
  summary: string;
  costCents?: number;
};

export async function runDelegationProcess(
  plan: DelegationExecutionPlan,
  runner: DelegationProcessRunner,
  signal?: AbortSignal,
): Promise<DelegationExecutionResult> {
  const validation = validateDelegationExecutionPlan(plan);
  if (!validation.valid) throw new Error(validation.reason);
  const child = await runner.start(plan);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let cancelled = signal?.aborted ?? false;
  const terminate = async (reason: string) => {
    try { await child.terminate(reason); } catch { /* recovery will classify an uncooperative child as lost */ }
  };
  const cancellation = new Promise<"cancelled" | "timeout">((resolveCancellation) => {
    timer = setTimeout(() => { timedOut = true; void terminate("timeout"); resolveCancellation("timeout"); }, plan.timeoutMs);
    const cancel = () => { cancelled = true; void terminate("cancelled"); resolveCancellation("cancelled"); };
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
  try {
    const outcome = await Promise.race([
      child.wait().then((completion) => ({ kind: "completed" as const, completion })),
      cancellation.then((kind) => ({ kind })),
    ]);
    if (outcome.kind === "cancelled" || cancelled) return { taskId: plan.taskId, status: "cancelled", summary: "La tarea hija fue cancelada." };
    if (outcome.kind === "timeout" || timedOut) return { taskId: plan.taskId, status: "failed", summary: "La tarea hija excedió el timeout." };
    const { completion } = outcome;
    if (!Number.isFinite(completion.costCents) || completion.costCents < 0) return { taskId: plan.taskId, status: "failed", summary: "La tarea hija devolvió un coste inválido." };
    if (completion.costCents > plan.budgetCents) {
      await terminate("budget");
      return { taskId: plan.taskId, status: "failed", summary: "La tarea hija excedió el presupuesto.", costCents: completion.costCents };
    }
    if (completion.exitCode === 0) return { taskId: plan.taskId, status: "succeeded", summary: "La tarea hija terminó correctamente.", costCents: completion.costCents };
    return { taskId: plan.taskId, status: "failed", summary: `La tarea hija terminó con código ${String(completion.exitCode)}.`, costCents: completion.costCents };
  } catch {
    return { taskId: plan.taskId, status: "lost", summary: "No se pudo recuperar el resultado de la tarea hija." };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The adapter remains deliberately unimplemented until isolation and recovery gates are closed. */
export type DelegationProcessAdapter = {
  start(plan: DelegationExecutionPlan): Promise<DelegationProcessHandle>;
  cancel(handle: DelegationProcessHandle, reason: string): Promise<void>;
};

export type DelegationWorktreeRequest = {
  taskId: string;
  workspaceRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
};

export type DelegationWorktreePlan = {
  taskId: string;
  workspaceRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  createCommand: readonly ["git", "worktree", "add", "--detach", string, string];
  removeCommand: readonly ["git", "worktree", "remove", string];
};

export type DelegationGitResult = { stdout: string; stderr: string };
export type DelegationGitRunner = (command: readonly string[], workingDirectory: string) => Promise<DelegationGitResult>;

export type DelegationWorktreeHandle = {
  taskId: string;
  workspaceRoot: string;
  worktreePath: string;
  branchName: string;
  createdAt: string;
};

export type DelegationWorktreeManager = {
  create(plan: DelegationWorktreePlan): Promise<DelegationWorktreeHandle>;
  remove(handle: DelegationWorktreeHandle): Promise<void>;
  isPresent(handle: DelegationWorktreeHandle): Promise<boolean>;
};

const execFile = promisify(execFileCallback);

/** Runs an explicit Git argv without a shell. Callers still decide when it is allowed. */
export async function runDelegationGitCommand(command: readonly string[], workingDirectory: string): Promise<DelegationGitResult> {
  const [executable, ...args] = command;
  if (executable !== "git") throw new Error("El runner de worktree solo permite ejecutar git.");
  const result = await execFile(executable, args, { cwd: workingDirectory, encoding: "utf8" });
  return { stdout: result.stdout, stderr: result.stderr };
}

/** Creates a controlled worktree manager around an explicitly injected Git runner. */
export function createDelegationWorktreeManager(runGit: DelegationGitRunner): DelegationWorktreeManager {
  return {
    async create(plan) {
      await runGit(plan.createCommand, plan.workspaceRoot);
      return {
        taskId: plan.taskId,
        workspaceRoot: plan.workspaceRoot,
        worktreePath: plan.worktreePath,
        branchName: plan.branchName,
        createdAt: new Date().toISOString(),
      };
    },
    async remove(handle) {
      await runGit(["git", "worktree", "remove", handle.worktreePath], handle.workspaceRoot);
    },
    async isPresent(handle) {
      const result = await runGit(["git", "worktree", "list", "--porcelain"], handle.workspaceRoot);
      return result.stdout.split(/\r?\n/)
        .filter((line) => line.startsWith("worktree "))
        .some((line) => resolve(line.slice("worktree ".length).trim()) === resolve(handle.worktreePath));
    },
  };
}

/**
 * Builds a worktree operation without touching the filesystem or invoking git.
 * A real manager must execute this only after the delegation recovery gate passes.
 */
export function planDelegationWorktree(request: DelegationWorktreeRequest): DelegationWorktreePlan {
  if (!request.taskId) throw new Error("La tarea es obligatoria para crear un worktree.");
  if (!isAbsolute(request.workspaceRoot) || !isAbsolute(request.worktreePath)) {
    throw new Error("Las rutas del worktree deben ser absolutas.");
  }
  if (resolve(request.workspaceRoot) === resolve(request.worktreePath) || isWithin(request.workspaceRoot, request.worktreePath)) {
    throw new Error("El worktree debe ubicarse fuera del checkout principal.");
  }
  if (!isSafeGitRef(request.branchName) || !isSafeGitRef(request.baseRef)) {
    throw new Error("La rama y la referencia base deben ser refs Git seguras.");
  }
  return {
    ...request,
    createCommand: ["git", "worktree", "add", "--detach", request.worktreePath, request.baseRef],
    removeCommand: ["git", "worktree", "remove", request.worktreePath],
  };
}

export function validateDelegationExecutionPlan(plan: DelegationExecutionPlan): { valid: true } | { valid: false; reason: string } {
  if (!plan.taskId || !plan.parentTaskId) return { valid: false, reason: "La tarea y su padre son obligatorios." };
  if (!isAbsolute(plan.workspaceRoot) || !isAbsolute(plan.workingDirectory)) return { valid: false, reason: "Las rutas de workspace deben ser absolutas." };
  if (!Number.isFinite(plan.timeoutMs) || plan.timeoutMs <= 0) return { valid: false, reason: "El timeout debe ser positivo." };
  if (!Number.isFinite(plan.budgetCents) || plan.budgetCents < 0) return { valid: false, reason: "El presupuesto no puede ser negativo." };
  if (plan.isolation === "read-only") {
    if (plan.worktreePath) return { valid: false, reason: "Una tarea read-only no puede declarar un worktree." };
    if (!isWithin(plan.workspaceRoot, plan.workingDirectory)) return { valid: false, reason: "La tarea read-only debe trabajar dentro del workspace." };
    return { valid: true };
  }
  if (!plan.ownership || plan.ownership.isolation !== plan.isolation) return { valid: false, reason: "La ejecución de escritura requiere ownership compatible con el aislamiento." };
  if (plan.isolation === "workspace" && resolve(plan.workingDirectory) !== resolve(plan.workspaceRoot)) {
    return { valid: false, reason: "El aislamiento workspace debe usar exactamente el checkout principal." };
  }
  if (plan.isolation === "worktree") {
    if (!plan.worktreePath || !isAbsolute(plan.worktreePath)) return { valid: false, reason: "El aislamiento worktree requiere una ruta absoluta explícita." };
    if (resolve(plan.worktreePath) === resolve(plan.workspaceRoot)) return { valid: false, reason: "El worktree no puede ser el checkout principal." };
    if (resolve(plan.workingDirectory) !== resolve(plan.worktreePath)) return { valid: false, reason: "El directorio de trabajo debe coincidir con el worktree." };
    if (isWithin(plan.workspaceRoot, plan.worktreePath)) return { valid: false, reason: "El worktree no puede ubicarse dentro del checkout principal." };
  }
  return { valid: true };
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function isSafeGitRef(value: string): boolean {
  return value.length > 0 && !/[\u0000-\u0020~^:?*\\[\\]]/.test(value) && !value.startsWith("-") && !value.includes("..") && !value.endsWith("/");
}
