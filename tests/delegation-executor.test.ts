import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";
import { validateDelegationExecutionPlan, type DelegationExecutionPlan } from "../src/delegation-executor.ts";

const workspaceRoot = resolve("test-fixtures", "repo");
const base: DelegationExecutionPlan = {
  taskId: "child-1",
  parentTaskId: "parent-1",
  isolation: "read-only",
  workspaceRoot,
  workingDirectory: join(workspaceRoot, "src"),
  timeoutMs: 60_000,
  budgetCents: 0,
};

test("acepta un plan read-only dentro del workspace", () => {
  assert.deepEqual(validateDelegationExecutionPlan(base), { valid: true });
});

test("rechaza un plan read-only fuera del workspace o con worktree", () => {
  assert.match(validateDelegationExecutionPlan({ ...base, workingDirectory: resolve(workspaceRoot, "..", "other") }).reason, /dentro del workspace/);
  assert.match(validateDelegationExecutionPlan({ ...base, worktreePath: resolve(workspaceRoot, "..", "worktree") }).reason, /read-only/);
});

test("exige ownership compatible para escrituras", () => {
  assert.match(validateDelegationExecutionPlan({ ...base, isolation: "workspace" }).reason, /ownership compatible/);
  assert.deepEqual(validateDelegationExecutionPlan({
    ...base,
    isolation: "workspace",
    workingDirectory: workspaceRoot,
    ownership: { scope: "src/app", isolation: "workspace" },
  }), { valid: true });
});

test("un worktree requiere una ruta explícita fuera del checkout principal", () => {
  const plan = {
    ...base,
    isolation: "worktree" as const,
    workingDirectory: resolve(workspaceRoot, "..", "worktrees", "child-1"),
    worktreePath: resolve(workspaceRoot, "..", "worktrees", "child-1"),
    ownership: { scope: "src/app", isolation: "worktree" as const },
  };
  assert.deepEqual(validateDelegationExecutionPlan(plan), { valid: true });
  assert.match(validateDelegationExecutionPlan({ ...plan, workingDirectory: join(workspaceRoot, ".worktree"), worktreePath: join(workspaceRoot, ".worktree") }).reason, /dentro del checkout/);
});

test("rechaza timeout y presupuesto inválidos", () => {
  assert.match(validateDelegationExecutionPlan({ ...base, timeoutMs: 0 }).reason, /timeout/);
  assert.match(validateDelegationExecutionPlan({ ...base, budgetCents: -1 }).reason, /presupuesto/);
});
