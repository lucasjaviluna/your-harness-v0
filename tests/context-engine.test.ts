import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ContextEngine, formatContextSnapshot } from "../src/context-engine.ts";
import type { RepositoryContext } from "../src/task.ts";

const emptyRepository = (repoRoot: string): RepositoryContext => ({
  repoRoot,
  instructionFiles: [],
  git: { available: false },
  mainFiles: ["src/", "README.md"],
  verificationCommands: ["npm test"],
  warnings: [],
});

test("el contexto progresivo incluye prompt, metadatos y solo archivos relacionados", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-harness-context-"));
  try {
    await mkdir(join(root, "src"));
    await mkdir(join(root, "node_modules", "auth"), { recursive: true });
    await mkdir(join(root, "openspec", "specs", "auth"), { recursive: true });
    await writeFile(join(root, "src", "auth.ts"), "export const auth = true;\n");
    await writeFile(join(root, "src", "billing.ts"), "export const billing = true;\n");
    await writeFile(join(root, "openspec", "specs", "auth", "spec.md"), "Autenticación mediante roles.\n");
    await writeFile(join(root, "node_modules", "auth", "auth.ts"), "dependency secret\n");
    await writeFile(join(root, "src", "credentials-auth.md"), "never include this secret\n");
    const repository = emptyRepository(root);
    repository.instructionFiles = [{ path: join(root, "AGENTS.md"), content: "No cambies contratos sin autorización." }];

    const snapshot = await new ContextEngine().compose({
      cwd: root,
      prompt: "Actualizar auth",
      repository,
      maxLevel: 2,
    });

    assert.deepEqual(snapshot.includedLevels, [0, 1, 2]);
    assert.equal(snapshot.entries.some((entry) => entry.title === "src/auth.ts"), true);
    assert.equal(snapshot.entries.some((entry) => entry.content.includes("No cambies contratos")), true);
    assert.equal(snapshot.entries.some((entry) => entry.source === "openspec"), true);
    assert.equal(snapshot.entries.some((entry) => entry.content.includes("never include this secret")), false);
    assert.equal(snapshot.entries.some((entry) => entry.title.includes("billing")), false);
    assert.equal(snapshot.entries.some((entry) => entry.content.includes("dependency secret")), false);
    assert.equal(snapshot.totalChars <= snapshot.maxChars, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("el nivel de arquitectura es condicional y el presupuesto limita la composición", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-harness-context-architecture-"));
  try {
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "README.md"), "# Architecture\n" + "a".repeat(100));
    await writeFile(join(root, "docs", "FOUNDATIONS.md"), "Decisiones de arquitectura\n");
    const repository = emptyRepository(root);

    const ordinary = await new ContextEngine().compose({ cwd: root, prompt: "Cambiar texto de botón", repository, maxLevel: 3 });
    assert.equal(ordinary.entries.some((entry) => entry.level === 3), false);

    const architecture = await new ContextEngine().compose({ cwd: root, prompt: "Revisar arquitectura del flujo", repository, maxLevel: 3, maxChars: 500 });
    assert.equal(architecture.entries.some((entry) => entry.level === 3), true);
    assert.equal(architecture.totalChars <= 500, true);
    assert.equal(formatContextSnapshot(architecture).includes("nivel 3"), true);

    const constrained = await new ContextEngine().compose({ cwd: root, prompt: "Revisar arquitectura del flujo", repository, maxLevel: 3, maxChars: 110 });
    assert.equal(constrained.totalChars, 110);
    assert.equal(constrained.omitted > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
