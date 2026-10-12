import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DelegationRegistry, readDelegationStore, writeDelegationStore } from "../src/delegation-store.ts";
import type { DelegatedTask } from "../src/delegation.ts";

function task(id: string, parentTaskId = "parent"): DelegatedTask {
  return { id, parentTaskId, status: "queued", mode: "task", depth: 1, createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z" };
}

test("persiste y recupera un registro versionado de delegación", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-delegation-"));
  const registry = new DelegationRegistry();
  registry.createTask(task("child-1"));
  await writeDelegationStore(cwd, registry.snapshot());
  const recovered = await readDelegationStore(cwd);
  assert.equal(recovered.schemaVersion, 1);
  assert.equal(recovered.tasks[0]?.id, "child-1");
  assert.equal(recovered.events[0]?.type, "created");
  assert.match(await readFile(join(cwd, ".harness", "delegation.json"), "utf8"), /schemaVersion/);
});

test("reconcilia hijos en ejecución como perdidos y conserva los terminales", () => {
  const registry = new DelegationRegistry();
  registry.createTask(task("child-running"));
  registry.recordEvent({ taskId: "child-running", type: "started", timestamp: "2026-10-12T00:01:00Z" });
  registry.createTask(task("child-done"));
  registry.recordEvent({ taskId: "child-done", type: "completed", timestamp: "2026-10-12T00:02:00Z" });
  const events = registry.reconcileAfterRestart("2026-10-12T00:03:00Z");
  assert.deepEqual(events.map((event) => event.taskId), ["child-running"]);
  assert.equal(registry.listForParent("parent").find((item) => item.id === "child-running")?.status, "lost");
  assert.equal(registry.listForParent("parent").find((item) => item.id === "child-done")?.status, "succeeded");
});

test("no permite exceder límites de hijos", () => {
  const registry = new DelegationRegistry();
  for (let index = 0; index < 4; index += 1) registry.createTask(task(`child-${index}`));
  assert.throws(() => registry.createTask(task("child-4")), /cantidad máxima/);
});
