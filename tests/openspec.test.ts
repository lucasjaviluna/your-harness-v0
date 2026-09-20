import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildOpenSpecDelegation, detectOpenSpec, extractOpenSpecChange, nextOpenSpecStep } from "../src/openspec.ts";
import { createTask } from "../src/task.ts";

test("detecta la instalación de OpenSpec para Pi sin ejecutar comandos", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-openspec-"));
  await mkdir(join(cwd, "openspec", "changes", "add-auth"), { recursive: true });
  await mkdir(join(cwd, ".pi", "prompts"), { recursive: true });
  await writeFile(join(cwd, ".pi", "prompts", "opsx-propose.md"), "generated");
  await writeFile(join(cwd, ".pi", "prompts", "opsx-apply.md"), "generated");
  const detection = await detectOpenSpec(cwd, { probeCli: false });
  assert.equal(detection.configured, true);
  assert.equal(detection.commandStyle, "prompt");
  assert.equal(detection.commands.propose, "/opsx-propose");
  assert.deepEqual(detection.activeChanges, ["add-auth"]);
});

test("no confunde la ausencia de OpenSpec con un proyecto configurado", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-no-openspec-"));
  const detection = await detectOpenSpec(cwd, { probeCli: false });
  assert.equal(detection.configured, false);
  assert.equal(detection.commandStyle, "unavailable");
  assert.match(detection.initCommand, /openspec/);
});

test("delega propose al comando generado sin duplicar la lógica de OpenSpec", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-delegation-"));
  const task = createTask({ prompt: "Agregar permisos por rol", cwd, requestedMode: "sdd", analyzeOnly: false });
  const detection = await detectOpenSpec(cwd, { probeCli: false });
  detection.configured = true;
  detection.commands.propose = "/opsx-propose";
  const prompt = buildOpenSpecDelegation(task, detection, "propose");
  assert.match(prompt ?? "", /^\/opsx-propose Agregar permisos por rol/);
  assert.match(prompt ?? "", /no ejecutes apply/);
});

test("avanza por el ciclo OpenSpec esperado", () => {
  assert.equal(nextOpenSpecStep("proposed"), "apply");
  assert.equal(nextOpenSpecStep("applied"), "verify");
  assert.equal(nextOpenSpecStep("verify"), "sync");
  assert.equal(nextOpenSpecStep("sync"), "archive");
  assert.equal(nextOpenSpecStep("archive"), "complete");
});

test("recupera el change desde la salida o desde el único cambio activo", () => {
  assert.equal(extractOpenSpecChange("change: add-auth", []), "add-auth");
  assert.equal(extractOpenSpecChange("sin nombre", ["add-auth"]), "add-auth");
  assert.equal(extractOpenSpecChange("sin nombre", ["one", "two"]), undefined);
});
