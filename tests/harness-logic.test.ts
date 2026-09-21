import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkRequest } from "../src/harness-logic.ts";

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
