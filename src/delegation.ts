export type DelegatedTaskStatus =
  | "queued"
  | "running"
  | "awaiting-input"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "lost";

export type DelegationMode = "task" | "background";

/** Isolation policy for a future child process. Execution is not enabled yet. */
export type DelegationIsolation = "read-only" | "workspace" | "worktree";

/** Explicit ownership reservation used to prevent concurrent writes to one scope. */
export type DelegationOwnership = {
  scope: string;
  isolation: DelegationIsolation;
  artifactPaths?: string[];
};

/** Persisted, prompt-free execution metadata needed to resume a queued child. */
export type DelegationExecutionPlanRecord = {
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

export type DelegationWorktreeState = "planned" | "created" | "removed" | "unknown";
export type DelegationWorktreeReviewDecision = "keep" | "remove";

export type DelegationWorktree = {
  path: string;
  branchName: string;
  state: DelegationWorktreeState;
  reviewRequired: boolean;
  reviewDecision?: DelegationWorktreeReviewDecision;
  reviewedAt?: string;
};

/** Persistable metadata for a future delegated child. No prompt or raw output is stored here. */
export type DelegatedTask = {
  id: string;
  parentTaskId: string;
  status: DelegatedTaskStatus;
  mode: DelegationMode;
  depth: number;
  scope?: string;
  ownership?: DelegationOwnership;
  executionPlan?: DelegationExecutionPlanRecord;
  worktree?: DelegationWorktree;
  summary?: string;
  createdAt: string;
  updatedAt: string;
};

export type DelegationEventType =
  | "created"
  | "started"
  | "progress"
  | "awaiting-input"
  | "completed"
  | "failed"
  | "cancelled"
  | "lost";

/** Compact audit event. `summary` must be safe to expose in the workspace view. */
export type DelegationEvent = {
  taskId: string;
  type: DelegationEventType;
  timestamp: string;
  summary?: string;
};

export type DelegationResult = {
  taskId: string;
  status: Extract<DelegatedTaskStatus, "succeeded" | "failed" | "cancelled" | "lost">;
  summary: string;
  changedFiles?: string[];
  checks?: string[];
};

export type DelegationLimits = {
  maxDepth: number;
  maxChildren: number;
  timeoutMs: number;
  budgetCents: number;
};

export const DEFAULT_DELEGATION_LIMITS: DelegationLimits = {
  maxDepth: 1,
  maxChildren: 4,
  timeoutMs: 15 * 60 * 1000,
  budgetCents: 0,
};

export function isTerminalDelegatedTaskStatus(status: DelegatedTaskStatus): boolean {
  return ["succeeded", "failed", "cancelled", "lost"].includes(status);
}

export function checkDelegationLimits(
  existingChildren: number,
  childDepth: number,
  limits: DelegationLimits = DEFAULT_DELEGATION_LIMITS,
): { allowed: true } | { allowed: false; reason: string } {
  if (childDepth > limits.maxDepth) return { allowed: false, reason: "Se alcanzó la profundidad máxima de delegación." };
  if (existingChildren >= limits.maxChildren) return { allowed: false, reason: "Se alcanzó la cantidad máxima de tareas hijas." };
  return { allowed: true };
}

export function checkDelegationOwnership(
  existingTasks: readonly DelegatedTask[],
  candidate: DelegatedTask,
): { allowed: true } | { allowed: false; reason: string; conflictingTaskId: string } {
  if (!candidate.ownership || candidate.ownership.isolation === "read-only") return { allowed: true };
  for (const existing of existingTasks) {
    if (isTerminalDelegatedTaskStatus(existing.status) || !existing.ownership || existing.ownership.isolation === "read-only") continue;
    const candidateArtifacts = new Set(candidate.ownership.artifactPaths ?? []);
    const existingArtifacts = existing.ownership.artifactPaths ?? [];
    const artifactsOverlap = candidateArtifacts.size > 0 && existingArtifacts.some((path) => candidateArtifacts.has(path));
    if (artifactsOverlap || existing.ownership.scope === candidate.ownership.scope) {
      return {
        allowed: false,
        conflictingTaskId: existing.id,
        reason: `El scope ${candidate.ownership.scope} ya pertenece a la tarea delegada ${existing.id}.`,
      };
    }
  }
  return { allowed: true };
}
