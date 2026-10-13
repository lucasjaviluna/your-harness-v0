import { isAbsolute, relative, resolve } from "node:path";
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
