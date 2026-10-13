import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

test("rechaza JSON de delegación corrupto o incompatible", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-delegation-invalid-"));
  const directory = join(cwd, ".harness");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "delegation.json"), "{", "utf8");
  await assert.rejects(readDelegationStore(cwd), /JSON de delegación está corrupto/);
  await writeFile(join(directory, "delegation.json"), JSON.stringify({ schemaVersion: 99, tasks: [], events: [] }), "utf8");
  await assert.rejects(readDelegationStore(cwd), /esquema 99, incompatible/);
});

test("rechaza tareas y eventos malformados aunque el esquema coincida", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-delegation-invalid-record-"));
  const directory = join(cwd, ".harness");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "delegation.json"), JSON.stringify({ schemaVersion: 1, tasks: [{ id: "missing-fields" }], events: [] }), "utf8");
  await assert.rejects(readDelegationStore(cwd), /tarea o evento malformado/);
});

test("no registra dos tareas de escritura sobre el mismo scope", () => {
  const registry = new DelegationRegistry();
  registry.createTask({
    ...task("child-owned"),
    ownership: { scope: "src/app", isolation: "workspace", artifactPaths: ["src/app/form.ts"] },
  });
  assert.throws(() => registry.createTask({
    ...task("child-conflict"),
    ownership: { scope: "src/app", isolation: "workspace", artifactPaths: ["src/app/form.ts"] },
  }), /ya pertenece/);
  registry.recordEvent({ taskId: "child-owned", type: "completed", timestamp: "2026-10-12T00:03:00Z" });
  assert.doesNotThrow(() => registry.createTask({
    ...task("child-after"),
    ownership: { scope: "src/app", isolation: "workspace", artifactPaths: ["src/app/form.ts"] },
  }));
});

test("persiste el worktree y exige revisión si queda incierto tras reiniciar", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-delegation-worktree-"));
  const registry = new DelegationRegistry();
  registry.createTask(task("child-worktree"));
  registry.recordEvent({ taskId: "child-worktree", type: "started", timestamp: "2026-10-13T00:01:00Z" });
  registry.attachWorktree("child-worktree", {
    path: join(cwd, "..", "child-worktree"), branchName: "harness/child-worktree", state: "created", reviewRequired: false,
  });
  await writeDelegationStore(cwd, registry.snapshot());
  const recovered = new DelegationRegistry(await readDelegationStore(cwd));
  const events = recovered.reconcileAfterRestart("2026-10-13T00:03:00Z");
  assert.equal(events[0]?.type, "lost");
  assert.deepEqual(recovered.listForParent("parent")[0]?.worktree, {
    path: join(cwd, "..", "child-worktree"), branchName: "harness/child-worktree", state: "unknown", reviewRequired: true,
  });
});

test("rechaza metadata de worktree malformada", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-delegation-worktree-invalid-"));
  const directory = join(cwd, ".harness");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "delegation.json"), JSON.stringify({
    schemaVersion: 1,
    tasks: [{ ...task("child-invalid"), worktree: { path: "/tmp/x", branchName: "main", state: "created" } }],
    events: [],
  }), "utf8");
  await assert.rejects(readDelegationStore(cwd), /tarea o evento malformado/);
});
