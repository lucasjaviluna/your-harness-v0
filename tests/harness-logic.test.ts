import assert from "node:assert/strict";
import test from "node:test";
import { compareCancelledRequest, parseIntentComparison, parseWorkRequest } from "../src/harness-logic.ts";
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
