import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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
