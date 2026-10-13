import { isAbsolute, relative, resolve } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { DelegationIsolation, DelegationOwnership } from "./delegation.ts";

/** Execution contract for a future child-process adapter. It carries no prompt or credentials. */
export type DelegationExecutionPlan = {
  taskId: string;
  parentTaskId: string;
  isolation: DelegationIsolation;
  workspaceRoot: string;
  workingDirectory: string;
  ownership?: DelegationOwnership;
  worktreePath?: string;
  timeoutMs: number;
  budgetCents: number;
};

export type DelegationProcessHandle = {
  taskId: string;
  pid?: number;
  workingDirectory: string;
  startedAt: string;
};

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
