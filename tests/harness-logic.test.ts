import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarnessCapabilityRegistry } from "../src/capabilities/index.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { compareCancelledRequest, compareTaskRequest, parseIntentComparison, parseWorkRequest, prepareHarnessTask } from "../src/harness-logic.ts";
import { createTask } from "../src/task.ts";

test("parsea una solicitud slash con modo y análisis opcionales", () => {
  assert.deepEqual(
    parseWorkRequest("--mode simple --analyze-only Cambiar el texto del botón"),
    { ok: true, requestedMode: "simple", analyzeOnly: true, prompt: "Cambiar el texto del botón" },
  );
});

test("usa el modo configurado cuando la solicitud no lo reemplaza", () => {
  assert.deepEqual(
    parseWorkRequest("Diseñar el flujo de sesiones", "task"),
    { ok: true, requestedMode: "task", analyzeOnly: false, prompt: "Diseñar el flujo de sesiones" },
  );
});

test("rechaza opciones y prompts vacíos sin crear una tarea", () => {
  assert.equal(parseWorkRequest("--mode unknown Una tarea").ok, false);
  assert.equal(parseWorkRequest("--unexpected Una tarea").ok, false);
  assert.equal(parseWorkRequest("--mode simple").ok, false);
});

test("un prompt idéntico a una tarea cancelada requiere revisión sin consultar el modelo", async () => {
  const cancelled = {
    ...createTask({ prompt: "Implementar reintentos HTTP.", cwd: "C:/fixture", requestedMode: "auto", analyzeOnly: false }),
    phase: "cancelled" as const,
  };
  const request = parseWorkRequest("Implementar reintentos HTTP.");
  assert.equal(request.ok, true);
  if (request.ok) assert.equal(await compareCancelledRequest(cancelled, request, async () => { throw new Error("No debe consultar el modelo"); }), "same");
});

test("dos formas de pedir el mismo cambio se comparan por intención", async () => {
  const cancelled = {
    ...createTask({ prompt: 'Cambiar label de boton login de "Login" a "Ingresar"', cwd: "C:/fixture", requestedMode: "auto", analyzeOnly: false }),
    phase: "cancelled" as const,
  };
  const paraphrase = parseWorkRequest('Nuevo texto para call to action de pantalla de login, pasa de "Login" a "Ingresar"');
  assert.equal(paraphrase.ok, true);
  if (paraphrase.ok) {
    assert.equal(await compareCancelledRequest(cancelled, paraphrase, async (previous, current) => {
      assert.equal(previous, cancelled.prompt);
      assert.equal(current, paraphrase.prompt);
      return "same";
    }), "same");
  }
});

test("respuesta ambigua o error del clasificador requieren revisión humana", async () => {
  const cancelled = {
    ...createTask({ prompt: "Implementar reintentos HTTP.", cwd: "C:/fixture", requestedMode: "auto", analyzeOnly: false }),
    phase: "cancelled" as const,
  };
  const request = parseWorkRequest("Implementar reintentos solo para errores 503.");
  assert.equal(parseIntentComparison(" SAME "), "same");
  assert.equal(parseIntentComparison("SAME. La intención coincide."), "same");
  assert.equal(parseIntentComparison("La respuesta es SAME"), "uncertain");
  if (request.ok) {
    assert.equal(await compareCancelledRequest(cancelled, request, async () => "uncertain"), "uncertain");
    assert.equal(await compareCancelledRequest(cancelled, request, async () => { throw new Error("Sin modelo"); }), "uncertain");
    assert.equal(await compareCancelledRequest({ ...cancelled, phase: "planning" }, request, async () => "same"), "not-cancelled");
  }
});

test("la comparación global funciona sin depender del estado de la tarea", async () => {
  const existing = { ...createTask({ prompt: "Cambiar el label del botón de login.", cwd: "C:/fixture", requestedMode: "auto", analyzeOnly: false }), phase: "awaiting-review" as const };
  const request = parseWorkRequest("Actualizar el texto del botón de acceso.");
  assert.equal(request.ok, true);
  if (request.ok) {
    assert.equal(await compareTaskRequest(existing, request, async () => "same"), "same");
    assert.equal(await compareTaskRequest({ ...existing, phase: "done" }, request, async () => "same"), "same");
  }
});

test("preparar una tarea obtiene el contexto mediante RepositoryCapability", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-repository-routing-"));
  try {
    const capabilities = createHarnessCapabilityRegistry();
    const repository = capabilities.get("repository")!;
    const execute = repository.execute.bind(repository);
    let inspections = 0;
    repository.execute = async (request, context) => {
      inspections++;
      return execute(request, context);
    };
    const task = await prepareHarnessTask({
      cwd,
      request: { ok: true, prompt: "Cambiar el texto del botón.", requestedMode: "simple", analyzeOnly: false },
      config: structuredClone(DEFAULT_CONFIG),
      capabilities,
    });
    assert.equal(inspections, 1);
    assert.equal(task.context?.git.available, false);
    assert.equal(task.context?.warnings.some((warning) => warning.includes("no pertenece a un repositorio Git")), true);
    assert.deepEqual(task.contextSnapshot?.includedLevels, [0, 1]);
    assert.equal(task.contextSnapshot?.entries[0]?.content, "Cambiar el texto del botón.");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("el contrato del registro impide asociar una capability a un id distinto", () => {
  const capabilities = createHarnessCapabilityRegistry();
  assert.throws(
    () => capabilities.register("git", capabilities.get("openspec")!),
    /no coincide con la clave/,
  );
});
