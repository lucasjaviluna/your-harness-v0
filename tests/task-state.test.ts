import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseTaskResumeRequest, TaskStateCoordinator } from "../src/task-state.ts";
import { createTask, type HarnessTask } from "../src/task.ts";

async function fixture(): Promise<{ cwd: string; task: HarnessTask }> {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-state-"));
  const task = { ...createTask({ prompt: "Persistir y recuperar", cwd, requestedMode: "task", analyzeOnly: false }), route: "task" as const, phase: "planning" as const };
  return { cwd, task };
}

test("parsea referencia y fuente de recuperación", () => {
  assert.deepEqual(parseTaskResumeRequest("abc --source artifact"), { ok: true, reference: "abc", source: "artifact" });
  assert.deepEqual(parseTaskResumeRequest("--source=session"), { ok: true, reference: undefined, source: "session" });
  assert.equal(parseTaskResumeRequest("--source otro").ok, false);
});

test("no usa una tarea de otra ruta como fuente de artefacto", async () => {
  const { cwd, task } = await fixture();
  try {
    const result = await new TaskStateCoordinator().resume({
      cwd,
      sessionTask: { ...task, route: "simple" },
      request: { ok: true, source: "session" },
      recoverInterrupted: false,
    });
    assert.equal(result.status, "invalid-session");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("sincroniza una tarea y conserva la ruta persistida", async () => {
  const { cwd, task } = await fixture();
  try {
    const coordinator = new TaskStateCoordinator();
    const persisted = await coordinator.sync(task);
    assert.match(persisted.artifactPath ?? "", /\.harness[\\/]tasks[\\/].+\.md$/);
    assert.equal((await coordinator.sync(persisted)).artifactPath, persisted.artifactPath);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bloquea escrituras cuando sesión y artefacto divergen", async () => {
  const { cwd, task } = await fixture();
  try {
    const coordinator = new TaskStateCoordinator();
    const persisted = await coordinator.sync(task);
    const resolution = await coordinator.prepareSessionTask(cwd, { ...persisted, phase: "awaiting-approval" }, true);
    assert.equal(resolution.status, "conflict");
    await assert.rejects(() => coordinator.sync({ ...persisted, phase: "done" }), /estados divergentes/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("la sesión elegida explícitamente recrea un artefacto corrupto", async () => {
  const { cwd, task } = await fixture();
  try {
    const coordinator = new TaskStateCoordinator();
    const persisted = await coordinator.sync(task);
    await writeFile(persisted.artifactPath!, "# corrupto\n", "utf8");
    const result = await coordinator.resume({
      cwd,
      sessionTask: persisted,
      request: { ok: true, reference: task.id, source: "session" },
      recoverInterrupted: true,
    });
    assert.equal(result.status, "ready");
    assert.match(await readFile(persisted.artifactPath!, "utf8"), /"schemaVersion": 1/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("el artefacto elegido explícitamente reemplaza el estado de sesión", async () => {
  const { cwd, task } = await fixture();
  try {
    const coordinator = new TaskStateCoordinator();
    const persisted = await coordinator.sync(task);
    const result = await coordinator.resume({
      cwd,
      sessionTask: { ...persisted, phase: "awaiting-approval" },
      request: { ok: true, reference: task.id, source: "artifact" },
      recoverInterrupted: false,
    });
    assert.equal(result.status, "ready");
    if (result.status === "ready") assert.equal(result.task.phase, "planning");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
