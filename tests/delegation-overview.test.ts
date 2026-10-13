import assert from "node:assert/strict";
import test from "node:test";
import { formatDelegationOverview } from "../src/delegation-overview.ts";
import type { DelegatedTask, DelegationEvent } from "../src/delegation.ts";

const task: DelegatedTask = {
  id: "child-1", parentTaskId: "parent-1", status: "lost", mode: "task", depth: 1,
  summary: "No hubo continuidad tras reiniciar.", createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:01:00Z",
};
const event: DelegationEvent = { taskId: task.id, type: "lost", timestamp: task.updatedAt, summary: task.summary };

test("expone diagnóstico read-only y distingue un hijo perdido", () => {
  const output = formatDelegationOverview([task], [event]);
  assert.match(output, /Ejecución: deshabilitada/);
  assert.match(output, /child-1: lost/);
  assert.match(output, /Eventos recientes: lost\/child-1/);
});

test("expone un worktree incierto como revisión requerida", () => {
  const output = formatDelegationOverview([{
    ...task,
    worktree: { path: "/tmp/child-1", branchName: "harness/child-1", state: "unknown", reviewRequired: true },
  }], []);
  assert.match(output, /Worktree: unknown/);
  assert.match(output, /Revisión requerida/);
});
