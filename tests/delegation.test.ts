import assert from "node:assert/strict";
import test from "node:test";
import { checkDelegationLimits, checkDelegationOwnership, isTerminalDelegatedTaskStatus, type DelegatedTask } from "../src/delegation.ts";

test("clasifica estados terminales de delegación sin asumir éxito", () => {
  assert.equal(isTerminalDelegatedTaskStatus("succeeded"), true);
  assert.equal(isTerminalDelegatedTaskStatus("lost"), true);
  assert.equal(isTerminalDelegatedTaskStatus("running"), false);
});

test("aplica límites de profundidad y cantidad antes de crear un hijo", () => {
  assert.deepEqual(checkDelegationLimits(0, 1), { allowed: true });
  assert.match(checkDelegationLimits(0, 2).reason, /profundidad máxima/);
  assert.match(checkDelegationLimits(4, 1).reason, /cantidad máxima/);
});

function task(id: string, status: DelegatedTask["status"] = "running"): DelegatedTask {
  return {
    id, parentTaskId: "parent", status, mode: "task", depth: 1,
    ownership: { scope: "src/app", isolation: "workspace", artifactPaths: ["src/app/form.ts"] },
    createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z",
  };
}

test("bloquea ownership concurrente del mismo scope y permite read-only", () => {
  const conflict = checkDelegationOwnership([task("child-1")], task("child-2"));
  assert.equal(conflict.allowed, false);
  if (!conflict.allowed) assert.equal(conflict.conflictingTaskId, "child-1");
  assert.deepEqual(checkDelegationOwnership([task("child-1")], { ...task("child-2"), ownership: { scope: "src/app", isolation: "read-only" } }), { allowed: true });
});

test("libera ownership cuando la tarea anterior es terminal", () => {
  assert.deepEqual(checkDelegationOwnership([task("child-done", "succeeded")], task("child-2")), { allowed: true });
});
