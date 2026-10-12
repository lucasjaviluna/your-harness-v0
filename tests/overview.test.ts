import assert from "node:assert/strict";
import test from "node:test";
import { formatHarnessOverview } from "../src/overview.ts";
import { createTask } from "../src/task.ts";
import { createWorkspaceSnapshot } from "../src/workspace.ts";

const openSpec = { configured: false, cliAvailable: false, commandStyle: "unavailable" as const, commands: {}, activeChanges: [] };

test("formatea una vista read-only de tarea, cambios y próximo paso", () => {
  const task = createTask({ prompt: "Actualizar la documentación", cwd: "/repo", requestedMode: "task", analyzeOnly: false });
  task.route = "task";
  task.phase = "awaiting-approval";
  task.humanGates.push({
    id: "gate-1", kind: "authorize", stage: "plan", reason: "aprobación", question: "¿Apruebas el plan?",
    evidence: [], blocksProgress: true,
  });

  const output = formatHarnessOverview(task, { available: true, status: [" M docs/README.md"], files: ["docs/README.md"] }, openSpec);
  assert.match(output, /Estado: awaiting-approval · ruta task/);
  assert.match(output, /Gate pendiente: ¿Apruebas el plan\?/);
  assert.match(output, /Cambios: docs\/README\.md/);
  assert.match(output, /Próximo paso: esperar aprobación humana/);
});

test("expone una vista útil aunque no haya tarea activa ni Git", () => {
  const output = formatHarnessOverview(undefined, { available: false, status: [], files: [], error: "git no disponible" }, openSpec);
  assert.match(output, /Tarea: ninguna activa/);
  assert.match(output, /Git: no disponible/);
  assert.match(output, /Error Git: git no disponible/);
});

test("construye un snapshot read-only con estados delegados sin ejecutar nada", () => {
  const task = createTask({ prompt: "Inspeccionar el workspace", cwd: "/repo", requestedMode: "task", analyzeOnly: false });
  const snapshot = createWorkspaceSnapshot(task, { available: true, status: [], files: [] }, openSpec, [
    { id: "child-1", parentTaskId: task.id, status: "awaiting-input", scope: "tests", updatedAt: "2026-10-12T00:00:00Z" },
  ]);
  assert.equal(snapshot.delegatedTasks[0]?.status, "awaiting-input");
  const output = formatHarnessOverview(snapshot.task, snapshot.repository, snapshot.openSpec, snapshot.delegatedTasks);
  assert.match(output, /Tareas delegadas: child-1 \(awaiting-input\)/);
});
