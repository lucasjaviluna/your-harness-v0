import assert from "node:assert/strict";
import test from "node:test";
import { applyAssessment, assessTask, decideGate, requestScopeChange } from "../src/assessment.ts";
import { createTask, formatTaskStatus, unresolvedGate } from "../src/task.ts";

function task(prompt: string, requestedMode: "auto" | "simple" | "task" | "sdd" = "auto") {
  return createTask({ prompt, cwd: "C:/fixture", requestedMode, analyzeOnly: false });
}

test("clasifica un cambio local claro como simple", () => {
  const result = assessTask(task("Renombrar una variable local en el parser."));
  assert.equal(result.recommendedRoute, "simple");
  assert.equal(result.confidence, "high");
});

test("clasifica trabajo con varias decisiones acotadas como task", () => {
  const result = assessTask(task("Implementar reintentos para llamadas HTTP fallidas."));
  assert.equal(result.recommendedRoute, "task");
});

test("clasifica permisos por rol como SDD y crea un gate", () => {
  const assessed = applyAssessment(task("Agregar permisos por rol a toda la aplicación."));
  assert.equal(assessed.route, "sdd");
  assert.equal(assessed.phase, "awaiting-approval");
  assert.equal(unresolvedGate(assessed)?.kind, "authorize");
});

test("una solicitud ambigua se detiene para aclarar", () => {
  const assessed = applyAssessment(task("Mejorar el sistema de sesiones."));
  assert.equal(assessed.route, "clarify");
  assert.equal(assessed.phase, "clarifying");
  assert.equal(unresolvedGate(assessed)?.kind, "clarify");
});

test("un prompt corto con impacto alto no se rebaja a simple", () => {
  const result = assessTask(task("Migrar el esquema de sesiones."));
  assert.equal(result.recommendedRoute, "sdd");
});

test("un prompt largo pero local se mantiene simple", () => {
  const result = assessTask(task("En el archivo src/ui/errors.ts, cambiar únicamente el texto del mensaje de error de login para que sea más claro para la persona usuaria."));
  assert.equal(result.recommendedRoute, "simple");
});

test("un override manual queda registrado, salvo que falte información decisiva", () => {
  const manual = assessTask(task("Corregir un texto de error.", "sdd"));
  assert.equal(manual.recommendedRoute, "simple");
  assert.equal(manual.route, "sdd");
  assert.equal(manual.routeSource, "manual");

  const ambiguous = assessTask(task("Mejorar el sistema de sesiones.", "simple"));
  assert.equal(ambiguous.route, "clarify");
  assert.equal(ambiguous.routeSource, "automatic");
});

test("una decisión SDD se persiste y desbloquea la planificación", () => {
  const assessed = {
    ...applyAssessment(task("Agregar permisos por rol.")),
    plan: { id: "plan-1", version: 1, objective: "Permisos", scope: "Permisos por rol", steps: ["Diseñar", "Verificar"], affectedFiles: [], verificationCommands: [], risks: [], assumptions: [] },
  };
  const planApproved = decideGate(assessed, "approve", "Preparar la propuesta.");
  assert.equal(planApproved.phase, "awaiting-approval");
  assert.equal(planApproved.humanGates[0].decision?.value, "approve");
  assert.equal(planApproved.plan?.approvedVersion, 1);
  const implementationApproved = decideGate(planApproved, "approve");
  assert.equal(implementationApproved.phase, "planning");
  assert.equal(unresolvedGate(implementationApproved), undefined);
  assert.equal(implementationApproved.plan?.approvedVersion, 1);
});

test("cancelar una tarea resuelve todos los gates pendientes", () => {
  const assessed = applyAssessment(task("Agregar permisos por rol."));
  const changedScope = requestScopeChange(assessed, "Agregar permisos y documentar los roles.");
  const cancelled = decideGate(changedScope, "cancel");
  assert.equal(cancelled.phase, "cancelled");
  assert.equal(unresolvedGate(cancelled), undefined);
  assert.ok(cancelled.humanGates.every((gate) => gate.decision?.value === "cancel"));
  assert.match(formatTaskStatus(cancelled), /Decisión requerida: ninguna/);
  assert.throws(() => requestScopeChange(cancelled, "Retomar la tarea"), /no se puede reactivar/);
});

test("una aclaración se conserva sin alterar el prompt original y se reevalúa", () => {
  const assessed = applyAssessment(task("Mejorar el sistema de sesiones."));
  const clarified = decideGate(assessed, "answer", "Renombrar una variable local en src/session/parser.ts.");
  assert.equal(clarified.prompt, "Mejorar el sistema de sesiones.");
  assert.equal(clarified.clarifications.length, 1);
  assert.equal(clarified.route, "simple");
});

test("analyze-only entrega la evaluación sin abrir un gate de implementación", () => {
  const analysis = applyAssessment(createTask({
    prompt: "Diseñar una migración de sesiones.",
    cwd: "C:/fixture",
    requestedMode: "auto",
    analyzeOnly: true,
  }));
  assert.equal(analysis.route, "sdd");
  assert.equal(analysis.phase, "done");
  assert.equal(unresolvedGate(analysis), undefined);
});

test("el core no necesita repositorio para evaluar otro perfil", () => {
  const result = assessTask(createTask({
    prompt: "Corregir el texto de una campaña.",
    cwd: "C:/sin-repositorio",
    requestedMode: "auto",
    analyzeOnly: false,
    profile: "marketing",
  }));
  assert.equal(result.profile, "marketing");
  assert.equal(result.recommendedRoute, "simple");
});
