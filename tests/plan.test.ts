import assert from "node:assert/strict";
import test from "node:test";
import { createHarnessPlan, formatPlanDetails, reviseHarnessPlan } from "../src/plan.ts";
import { createTask } from "../src/task.ts";

test("crea un plan visible a partir de la evaluación de la tarea", () => {
  const task = {
    ...createTask({ prompt: "Diseñar un flujo de reintentos", cwd: ".", requestedMode: "task", analyzeOnly: false }),
    route: "task" as const,
    scope: "Diseñar y verificar el flujo de reintentos",
    context: { mainFiles: ["src/retry.ts"], verificationCommands: ["npm test"] } as never,
    assessment: { reasons: ["Requiere varios pasos"], unknowns: [] } as never,
  };
  const plan = createHarnessPlan(task);
  assert.equal(plan.version, 1);
  assert.equal(plan.scope, "Diseñar y verificar el flujo de reintentos");
  assert.deepEqual(plan.affectedFiles, ["src/retry.ts"]);
  assert.match(formatPlanDetails(plan), /npm test/);
});

test("modificar un plan incrementa la versión e invalida la aprobación", () => {
  const task = createTask({ prompt: "Cambiar un texto", cwd: ".", requestedMode: "simple", analyzeOnly: false });
  const plan = { ...createHarnessPlan(task), approvedVersion: 1, approvedAt: "2026-09-21T00:00:00.000Z" };
  const revised = reviseHarnessPlan(plan, { scope: "Cambiar el texto y agregar una verificación" });
  assert.equal(revised.version, 2);
  assert.equal(revised.scope, "Cambiar el texto y agregar una verificación");
  assert.equal(revised.approvedVersion, undefined);
  assert.equal(revised.approvedAt, undefined);
});
