import type { OpenSpecDetection } from "./openspec.ts";
import type { RepositorySnapshot } from "./simple.ts";
import type { HarnessTask } from "./task.ts";
import type { DelegatedTaskStatus } from "./delegation.ts";

export type { DelegatedTaskStatus } from "./delegation.ts";

/** Minimal, non-sensitive child-task summary reserved for the read-only workspace view. */
export type DelegatedTaskSummary = {
  id: string;
  parentTaskId: string;
  status: DelegatedTaskStatus;
  scope?: string;
  summary?: string;
  updatedAt?: string;
};

/** Read-only view model for the current workspace. It does not execute or mutate anything. */
export type WorkspaceSnapshot = {
  task?: HarnessTask;
  repository: RepositorySnapshot;
  openSpec: OpenSpecDetection;
  delegatedTasks: DelegatedTaskSummary[];
};

export function createWorkspaceSnapshot(
  task: HarnessTask | undefined,
  repository: RepositorySnapshot,
  openSpec: OpenSpecDetection,
  delegatedTasks: readonly DelegatedTaskSummary[] = [],
): WorkspaceSnapshot {
  return { task, repository, openSpec, delegatedTasks: [...delegatedTasks] };
}
