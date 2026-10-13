import assert from "node:assert/strict";
import test from "node:test";
import { validateDelegationExecutionPlan, type DelegationExecutionPlan } from "../src/delegation-executor.ts";

const base: DelegationExecutionPlan = {
  taskId: "child-1",
  parentTaskId: "parent-1",
  isolation: "read-only",
  workspaceRoot: "C:\\repo",
  workingDirectory: "C:\\repo\\src",
  timeoutMs: 60_000,
  budgetCents: 0,
};

test("acepta un plan read-only dentro del workspace", () => {
  assert.deepEqual(validateDelegationExecutionPlan(base), { valid: true });
});

test("rechaza un plan read-only fuera del workspace o con worktree", () => {
  assert.match(validateDelegationExecutionPlan({ ...base, workingDirectory: "C:\\other" }).reason, /dentro del workspace/);
  assert.match(validateDelegationExecutionPlan({ ...base, worktreePath: "C:\\worktree" }).reason, /read-only/);
});

test("exige ownership compatible para escrituras", () => {
  assert.match(validateDelegationExecutionPlan({ ...base, isolation: "workspace" }).reason, /ownership compatible/);
  assert.deepEqual(validateDelegationExecutionPlan({
    ...base,
    isolation: "workspace",
    workingDirectory: "C:\\repo",
    ownership: { scope: "src/app", isolation: "workspace" },
  }), { valid: true });
});

test("un worktree requiere una ruta explícita fuera del checkout principal", () => {
  const plan = {
    ...base,
    isolation: "worktree" as const,
    workingDirectory: "C:\\worktrees\\child-1",
    worktreePath: "C:\\worktrees\\child-1",
    ownership: { scope: "src/app", isolation: "worktree" as const },
  };
  assert.deepEqual(validateDelegationExecutionPlan(plan), { valid: true });
  assert.match(validateDelegationExecutionPlan({ ...plan, workingDirectory: "C:\\repo\\.worktree", worktreePath: "C:\\repo\\.worktree" }).reason, /dentro del checkout/);
});

test("rechaza timeout y presupuesto inválidos", () => {
  assert.match(validateDelegationExecutionPlan({ ...base, timeoutMs: 0 }).reason, /timeout/);
  assert.match(validateDelegationExecutionPlan({ ...base, budgetCents: -1 }).reason, /presupuesto/);
});
