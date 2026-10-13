import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";
import { DelegationRegistry } from "../src/delegation-store.ts";
import { createDelegationProcessRunner, createDelegationWorktreeManager, planDelegationWorktree, runDelegationProcess, validateDelegationExecutionPlan, type DelegationExecutionPlan } from "../src/delegation-executor.ts";
import { createDelegationLauncher } from "../src/delegation-launcher.ts";

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

test("el controlador acepta una finalización dentro del presupuesto", async () => {
  let terminated = false;
  const result = await runDelegationProcess({ ...base, timeoutMs: 100 }, {
    start: async () => ({ taskId: base.taskId, wait: async () => ({ exitCode: 0, costCents: 0 }), terminate: async () => { terminated = true; } }),
  });
  assert.deepEqual(result, { taskId: "child-1", status: "succeeded", summary: "La tarea hija terminó correctamente.", costCents: 0 });
  assert.equal(terminated, false);
});

test("el controlador cancela y termina el proceso ante AbortSignal", async () => {
  let terminatedReason = "";
  const controller = new AbortController();
  const pending = runDelegationProcess({ ...base, timeoutMs: 500 }, {
    start: async () => ({ taskId: base.taskId, wait: () => new Promise(() => undefined), terminate: async (reason) => { terminatedReason = reason; } }),
  }, controller.signal);
  controller.abort();
  assert.deepEqual(await pending, { taskId: "child-1", status: "cancelled", summary: "La tarea hija fue cancelada." });
  assert.equal(terminatedReason, "cancelled");
});

test("el controlador aplica timeout y presupuesto sin conservar salida del hijo", async () => {
  let timeoutReason = "";
  const timeoutResult = await runDelegationProcess({ ...base, timeoutMs: 5 }, {
    start: async () => ({ taskId: base.taskId, wait: () => new Promise(() => undefined), terminate: async (reason) => { timeoutReason = reason; } }),
  });
  assert.match(timeoutResult.summary, /timeout/);
  assert.equal(timeoutResult.status, "failed");
  assert.equal(timeoutReason, "timeout");
  const budgetResult = await runDelegationProcess({ ...base, budgetCents: 1 }, {
    start: async () => ({ taskId: base.taskId, wait: async () => ({ exitCode: 0, costCents: 2 }), terminate: async () => undefined }),
  });
  assert.deepEqual(budgetResult, { taskId: "child-1", status: "failed", summary: "La tarea hija excedió el presupuesto.", costCents: 2 });
});

test("el runner real usa argv sin shell y devuelve solo metadatos", async () => {
  const runner = createDelegationProcessRunner({ command: process.execPath, args: ["-e", "process.exit(0)"] });
  const result = await runDelegationProcess({ ...base, workspaceRoot: process.cwd(), workingDirectory: process.cwd(), timeoutMs: 500 }, runner);
  assert.deepEqual(result, { taskId: "child-1", status: "succeeded", summary: "La tarea hija terminó correctamente.", costCents: 0 });
});

test("el runner real clasifica un comando inexistente como perdido", async () => {
  const runner = createDelegationProcessRunner({ command: "yh-pi-command-that-does-not-exist", args: [] });
  const result = await runDelegationProcess({ ...base, workspaceRoot: process.cwd(), workingDirectory: process.cwd(), timeoutMs: 500 }, runner);
  assert.deepEqual(result, { taskId: "child-1", status: "lost", summary: "No se pudo recuperar el resultado de la tarea hija." });
});

test("el runner real propaga cancelación y espera el cierre del hijo", async () => {
  const controller = new AbortController();
  const runner = createDelegationProcessRunner({ command: process.execPath, args: ["-e", "setTimeout(() => undefined, 10_000)"] });
  const pending = runDelegationProcess({ ...base, workspaceRoot: process.cwd(), workingDirectory: process.cwd(), timeoutMs: 5_000 }, runner, controller.signal);
  controller.abort();
  assert.deepEqual(await pending, { taskId: "child-1", status: "cancelled", summary: "La tarea hija fue cancelada." });
});

test("el runner real aplica timeout y recupera el proceso hijo", async () => {
  const runner = createDelegationProcessRunner({ command: process.execPath, args: ["-e", "setTimeout(() => undefined, 10_000)"] });
  const result = await runDelegationProcess({ ...base, workspaceRoot: process.cwd(), workingDirectory: process.cwd(), timeoutMs: 10 }, runner);
  assert.deepEqual(result, { taskId: "child-1", status: "failed", summary: "La tarea hija excedió el timeout." });
});

function registeredTask(): { registry: DelegationRegistry; task: Parameters<DelegationRegistry["createTask"]>[0] } {
  const registry = new DelegationRegistry();
  const task = {
    id: "child-1",
    parentTaskId: "parent-1",
    status: "queued" as const,
    mode: "task" as const,
    depth: 1,
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
  };
  registry.createTask(task);
  return { registry, task };
}

test("el launcher opt-in persiste started y el resultado resumido", async () => {
  const { registry, task } = registeredTask();
  const persisted: string[] = [];
  const launcher = createDelegationLauncher({
    enabled: true,
    registry,
    persist: async () => { persisted.push(registry.snapshot().events.at(-1)?.type ?? ""); },
    now: () => "2026-10-13T00:00:01.000Z",
    runner: { start: async () => ({ taskId: task.id, wait: async () => ({ exitCode: 0, costCents: 0 }), terminate: async () => undefined }) },
  });
  const result = await launcher.launch(task, { ...base, workspaceRoot: process.cwd(), workingDirectory: process.cwd() });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(persisted, ["started", "completed"]);
  assert.equal(registry.snapshot().tasks[0]?.status, "succeeded");
});

test("el launcher permanece apagado por defecto y no inicia el runner", async () => {
  const { registry, task } = registeredTask();
  let started = false;
  const launcher = createDelegationLauncher({
    enabled: false,
    registry,
    persist: async () => undefined,
    runner: { start: async () => { started = true; throw new Error("no debe iniciar"); } },
  });
  await assert.rejects(launcher.launch(task, { ...base, workspaceRoot: process.cwd(), workingDirectory: process.cwd() }), /deshabilitada/);
  assert.equal(started, false);
  assert.equal(registry.snapshot().tasks[0]?.status, "queued");
});

test("el launcher persiste pérdida si el resultado no puede guardarse", async () => {
  const { registry, task } = registeredTask();
  let writes = 0;
  const launcher = createDelegationLauncher({
    enabled: true,
    registry,
    persist: async () => { writes += 1; if (writes === 2) throw new Error("store no disponible"); },
    runner: { start: async () => ({ taskId: task.id, wait: async () => ({ exitCode: 0, costCents: 0 }), terminate: async () => undefined }) },
  });
  const result = await launcher.launch(task, { ...base, workspaceRoot: process.cwd(), workingDirectory: process.cwd() });
  assert.deepEqual(result, { taskId: task.id, status: "lost", summary: "La tarea hija terminó, pero no se pudo persistir su resultado.", costCents: 0 });
  assert.equal(registry.snapshot().tasks[0]?.status, "succeeded");
});
