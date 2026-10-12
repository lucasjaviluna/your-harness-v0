export type DelegatedTaskStatus =
  | "queued"
  | "running"
  | "awaiting-input"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "lost";

export type DelegationMode = "task" | "background";

/** Persistable metadata for a future delegated child. No prompt or raw output is stored here. */
export type DelegatedTask = {
  id: string;
  parentTaskId: string;
  status: DelegatedTaskStatus;
  mode: DelegationMode;
  depth: number;
  scope?: string;
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
