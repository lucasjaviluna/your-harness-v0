import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyAssessment } from "../src/assessment.ts";
import { readTaskArtifact, renderTaskArtifact, writeTaskArtifact } from "../src/task-artifact.ts";
import { createTask } from "../src/task.ts";

async function createTaskFixture() {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-task-"));
  const task = applyAssessment(createTask({
    prompt: "Implementar reintentos para llamadas HTTP fallidas.",
    cwd,
    requestedMode: "auto",
    analyzeOnly: false,
  }));
  return { cwd, task };
}

test("crea un artefacto Markdown con las secciones de una tarea ligera", async () => {
  const { cwd, task } = await createTaskFixture();
  try {
    const path = await writeTaskArtifact(task);
    const content = await readFile(path, "utf8");
    assert.match(content, /## Objective/);
    assert.match(content, /## Scope/);
    assert.match(content, /## Constraints/);
    assert.match(content, /## Tasks/);
    assert.match(content, /## Decisions/);
    assert.match(content, /## Evidence/);
    assert.match(content, /## Progress/);
    assert.match(content, /## Next step/);
    assert.match(content, /awaiting-approval/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("reconstruye una tarea desde su artefacto", async () => {
  const { cwd, task } = await createTaskFixture();
  try {
    const path = await writeTaskArtifact(task);
    const recovered = await readTaskArtifact(cwd, task.id);
    assert.equal(recovered.path, path);
    assert.equal(recovered.task.id, task.id);
    assert.equal(recovered.task.prompt, task.prompt);
    assert.equal(recovered.task.route, "task");
    assert.equal(recovered.task.phase, "awaiting-approval");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("preserva las tareas manuales al actualizar el artefacto", () => {
  const task = createTask({ prompt: "Mantener el flujo de pagos.", cwd: "C:/fixture", requestedMode: "task", analyzeOnly: false });
  const previous = [
    "## Tasks",
    "",
    "- [x] Analizar el flujo existente",
    "- [ ] Implementar el cambio acordado",
  ].join("\n");
  const updated = renderTaskArtifact({ ...task, phase: "planning", route: "task" }, previous);
  assert.match(updated, /\[x\] Analizar el flujo existente/);
  assert.match(updated, /\[ \] Implementar el cambio acordado/);
});

test("rechaza un artefacto sin estado de pi-harness", async () => {
  const { cwd, task } = await createTaskFixture();
  try {
    const path = await writeTaskArtifact(task);
    await writeFile(path, "# tarea sin estado\n", "utf8");
    await assert.rejects(() => readTaskArtifact(cwd, task.id), /no contiene estado/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
