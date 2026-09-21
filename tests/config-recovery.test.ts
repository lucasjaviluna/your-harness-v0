import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.ts";
import { isActiveTask, recoverInterruptedTask } from "../src/recovery.ts";
import { createTask } from "../src/task.ts";

test("usa defaults cuando el proyecto no tiene configuración", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-config-default-"));
  const result = await loadConfig(cwd);
  assert.equal(result.source, "defaults");
  assert.deepEqual(result.config, DEFAULT_CONFIG);
});

test("valida configuración de proyecto y conserva warnings", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-config-project-"));
  await mkdir(join(cwd, ".harness"));
  await writeFile(join(cwd, ".harness", "config.json"), JSON.stringify({ defaultMode: "task", profile: "product-owner", hil: { requireReview: false }, unknown: true }));
  const result = await loadConfig(cwd);
  assert.equal(result.source, "project");
  assert.equal(result.config.defaultMode, "task");
  assert.equal(result.config.profile, "product-owner");
  assert.equal(result.config.hil.requireReview, false);
  assert.match(result.warnings.join("\n"), /desconocida/);
});

test("los overrides de runtime prevalecen sobre la configuración del proyecto", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-config-runtime-"));
  await mkdir(join(cwd, ".harness"), { recursive: true });
  await writeFile(join(cwd, ".harness", "config.json"), JSON.stringify({ defaultMode: "simple", profile: "developer" }));
  const result = await loadConfig(cwd, { defaultMode: "sdd", profile: "product-owner" });
  assert.equal(result.config.defaultMode, "sdd");
  assert.equal(result.config.profile, "product-owner");
});

test("la captura de input queda apagada por default y puede activarse por runtime", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-config-input-"));
  assert.equal((await loadConfig(cwd, {})).config.captureInput, false);
  assert.equal((await loadConfig(cwd, { captureInput: true })).config.captureInput, true);
});

test("una tarea interrumpida vuelve a planificación con gate de recuperación", () => {
  const task = createTask({ prompt: "Actualizar permisos por rol", cwd: ".", requestedMode: "sdd", analyzeOnly: false });
  const interrupted = recoverInterruptedTask({ ...task, phase: "implementing", route: "sdd" });
  assert.equal(interrupted.phase, "awaiting-approval");
  assert.equal(interrupted.humanGates.at(-1)?.kind, "recover");
  assert.equal(isActiveTask(interrupted), true);
});

test("las tareas terminadas no se recuperan ni se consideran activas", () => {
  const task = createTask({ prompt: "Cambiar texto", cwd: ".", requestedMode: "simple", analyzeOnly: false });
  const done = { ...task, phase: "done" as const };
  assert.equal(recoverInterruptedTask(done), done);
  assert.equal(isActiveTask(done), false);
});
