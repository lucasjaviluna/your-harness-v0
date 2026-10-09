import assert from "node:assert/strict";
import test from "node:test";
import { reconcileTaskState } from "../src/task-reconciliation.ts";
import { createTask } from "../src/task.ts";

function fixture() {
  return { ...createTask({ prompt: "Recuperar estado", cwd: "C:/fixture", requestedMode: "task", analyzeOnly: false }), route: "task" as const };
}

test("reconcilia estados equivalentes ignorando la ruta del artefacto", () => {
  const task = fixture();
  const result = reconcileTaskState(task, { ...task, artifactPath: "C:/fixture/.harness/tasks/task.md" });
  assert.equal(result.status, "matched");
  assert.equal(result.task.artifactPath, "C:/fixture/.harness/tasks/task.md");
});

test("expone un conflicto sin elegir una fuente silenciosamente", () => {
  const task = fixture();
  const result = reconcileTaskState({ ...task, phase: "planning" }, { ...task, phase: "awaiting-approval" });
  assert.equal(result.status, "conflict");
  if (result.status !== "conflict") return;
  assert.match(result.message, /--source session\|artifact/);
  assert.equal(result.session.phase, "planning");
  assert.equal(result.artifact.phase, "awaiting-approval");
});

test("respeta la fuente elegida para resolver un conflicto", () => {
  const task = fixture();
  const session = { ...task, phase: "planning" as const };
  const artifact = { ...task, phase: "awaiting-approval" as const };
  assert.equal(reconcileTaskState(session, artifact, "session").task.phase, "planning");
  assert.equal(reconcileTaskState(session, artifact, "artifact").task.phase, "awaiting-approval");
});

test("rechaza reconciliar identificadores distintos", () => {
  const task = fixture();
  assert.throws(() => reconcileTaskState(task, { ...task, id: `${task.id}-otro` }), /tareas distintas/i);
});
