import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolve } from "node:path";
import { createDelegationProcessRunner } from "../src/delegation-executor.ts";
import { createDelegationSessionController } from "../src/delegation-session.ts";
import { DelegationRegistry, readDelegationStore, writeDelegationStore } from "../src/delegation-store.ts";

test("el estado persistido de delegación queda listo para el workspace tras reiniciar", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-session-"));
  const registry = new DelegationRegistry();
  registry.createTask({
    id: "child-running", parentTaskId: "parent", status: "queued", mode: "task", depth: 1,
    createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z",
  });
  registry.recordEvent({ taskId: "child-running", type: "started", timestamp: "2026-10-12T00:01:00Z" });
  await writeDelegationStore(cwd, registry.snapshot());

  const restored = new DelegationRegistry(await readDelegationStore(cwd));
  const lostEvents = restored.reconcileAfterRestart("2026-10-12T00:02:00Z");
  assert.equal(lostEvents[0]?.type, "lost");
  assert.equal(restored.listForParent("parent")[0]?.status, "lost");
});

test("la sesión encola un plan validado y exige aprobación humana para lanzarlo", async () => {
  const registry = new DelegationRegistry();
  const events: string[] = [];
  const controller = createDelegationSessionController({
    enabled: true,
    registry,
    persist: async () => { events.push(registry.snapshot().events.at(-1)?.type ?? "persist"); },
    now: () => "2026-10-13T00:00:00.000Z",
    runner: { start: async () => ({ taskId: "child-1", wait: async () => ({ exitCode: 0, costCents: 0 }), terminate: async () => undefined }) },
  });
  const queued = await controller.queue({
    taskId: "child-1", parentTaskId: "parent-1", mode: "task", depth: 1, isolation: "read-only",
    workspaceRoot: resolve("test-fixtures", "repo"), workingDirectory: resolve("test-fixtures", "repo", "src"), timeoutMs: 1_000, budgetCents: 0,
  });
  await assert.rejects(controller.launch(queued, false), /aprobación humana/);
  const result = await controller.launch(queued, true);
  assert.equal(result.status, "succeeded");
  assert.deepEqual(events, ["created", "started", "completed"]);
});

test("la sesión propaga la cancelación del padre al launcher", async () => {
  const registry = new DelegationRegistry();
  const controller = createDelegationSessionController({
    enabled: true,
    registry,
    persist: async () => undefined,
    runner: createDelegationProcessRunner({ command: process.execPath, args: ["-e", "setTimeout(() => undefined, 10_000)"] }),
  });
  const queued = await controller.queue({
    taskId: "child-2", parentTaskId: "parent-1", mode: "background", depth: 1, isolation: "read-only",
    workspaceRoot: process.cwd(), workingDirectory: process.cwd(), timeoutMs: 5_000, budgetCents: 0,
  });
  const parentController = new AbortController();
  const pending = controller.launch(queued, true, parentController.signal);
  parentController.abort();
  const result = await pending;
  assert.equal(result.status, "cancelled");
});
