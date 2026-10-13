import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";
import { createDelegationWorktreeManager, planDelegationWorktree, validateDelegationExecutionPlan, type DelegationExecutionPlan } from "../src/delegation-executor.ts";

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

test("prepara comandos declarativos de worktree sin ejecutarlos", () => {
  const worktreePath = resolve(workspaceRoot, "..", "worktrees", "child-1");
  assert.deepEqual(planDelegationWorktree({
    taskId: "child-1",
    workspaceRoot,
    worktreePath,
    branchName: "harness/child-1",
    baseRef: "HEAD",
  }), {
    taskId: "child-1",
    workspaceRoot,
    worktreePath,
    branchName: "harness/child-1",
    baseRef: "HEAD",
    createCommand: ["git", "worktree", "add", "--detach", worktreePath, "HEAD"],
    removeCommand: ["git", "worktree", "remove", worktreePath],
  });
});

test("rechaza worktrees dentro del checkout y refs inseguras", () => {
  const worktreePath = join(workspaceRoot, ".worktree");
  assert.throws(() => planDelegationWorktree({
    taskId: "child-1", workspaceRoot, worktreePath, branchName: "harness/child-1", baseRef: "HEAD",
  }), /fuera del checkout/);
  assert.throws(() => planDelegationWorktree({
    taskId: "child-1", workspaceRoot, worktreePath: resolve(workspaceRoot, "..", "worktree"), branchName: "-bad", baseRef: "HEAD",
  }), /refs Git seguras/);
});

test("el manager ejecuta creación y remoción solo mediante el runner inyectado", async () => {
  const worktreePath = resolve(workspaceRoot, "..", "worktrees", "child-1");
  const plan = planDelegationWorktree({
    taskId: "child-1", workspaceRoot, worktreePath, branchName: "harness/child-1", baseRef: "HEAD",
  });
  const calls: Array<{ command: readonly string[]; cwd: string }> = [];
  const manager = createDelegationWorktreeManager(async (command, cwd) => { calls.push({ command, cwd }); return { stdout: "", stderr: "" }; });
  const handle = await manager.create(plan);
  await manager.remove(handle);
  assert.equal(handle.taskId, "child-1");
  assert.equal(handle.worktreePath, worktreePath);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { command: plan.createCommand, cwd: workspaceRoot });
  assert.deepEqual(calls[1], { command: ["git", "worktree", "remove", worktreePath], cwd: workspaceRoot });
});

test("verifica la presencia física a partir de git worktree list", async () => {
  const worktreePath = resolve(workspaceRoot, "..", "worktrees", "child-1");
  const plan = planDelegationWorktree({ taskId: "child-1", workspaceRoot, worktreePath, branchName: "harness/child-1", baseRef: "HEAD" });
  const manager = createDelegationWorktreeManager(async () => ({ stdout: `worktree ${worktreePath}\nHEAD abc\n`, stderr: "" }));
  const handle = await manager.create(plan);
  assert.equal(await manager.isPresent(handle), true);
});

test("el manager no oculta errores de Git y no fabrica un handle", async () => {
  const worktreePath = resolve(workspaceRoot, "..", "worktrees", "child-1");
  const plan = planDelegationWorktree({
    taskId: "child-1", workspaceRoot, worktreePath, branchName: "harness/child-1", baseRef: "HEAD",
  });
  const manager = createDelegationWorktreeManager(async () => { throw new Error("git falló"); });
  await assert.rejects(manager.create(plan), /git falló/);
});
