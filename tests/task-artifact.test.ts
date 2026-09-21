import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyAssessment, decideGate } from "../src/assessment.ts";
import { deleteCancelledTaskArtifact, readTaskArtifact, renderTaskArtifact, writeTaskArtifact } from "../src/task-artifact.ts";
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

test("la cancelación queda visible en el Markdown sin perder decisiones manuales", async () => {
  const { cwd, task } = await createTaskFixture();
  try {
    const path = await writeTaskArtifact(task);
    const original = await readFile(path, "utf8");
    await writeFile(path, original.replace("- No hay decisiones registradas.", "- Nota manual: no continuar sin revisión."), "utf8");
    const cancelled = decideGate(task, "cancel");
    await writeTaskArtifact(cancelled);
    const content = await readFile(path, "utf8");
    assert.match(content, /Status: \*\*cancelled\*\*/);
    assert.match(content, /- Cancelled: \d{4}-\d{2}-\d{2}T/);
    assert.match(content, /Nota manual: no continuar sin revisión/);
    assert.match(content, /authorize: \*\*cancel\*\*/);
    assert.match(content, /Sin próximos pasos\. Si se retoma la solicitud, crear una tarea nueva\./);
    assert.equal((await readTaskArtifact(cwd, task.id)).task.phase, "cancelled");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("solo borra el archivo exacto de una tarea ligera cancelada", async () => {
  const { cwd, task } = await createTaskFixture();
  try {
    const path = await writeTaskArtifact(task);
    await assert.rejects(() => deleteCancelledTaskArtifact(task), /cancelada/);
    const cancelled = decideGate(task, "cancel");
    await writeTaskArtifact(cancelled);
    await assert.rejects(() => deleteCancelledTaskArtifact({ ...cancelled, artifactPath: join(cwd, "otro.md") }), /no coincide/);
    await assert.rejects(() => deleteCancelledTaskArtifact({ ...cancelled, id: "../fuera" }), /identificador/);
    assert.equal(await deleteCancelledTaskArtifact({ ...cancelled, artifactPath: path }), path);
    await assert.rejects(() => access(path), /ENOENT/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("no borra un archivo cuyo estado persistido no está cancelado", async () => {
  const { cwd, task } = await createTaskFixture();
  try {
    const path = await writeTaskArtifact(task);
    const cancelled = decideGate(task, "cancel");
    await assert.rejects(() => deleteCancelledTaskArtifact({ ...cancelled, artifactPath: path }), /estado del archivo/);
    await access(path);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
