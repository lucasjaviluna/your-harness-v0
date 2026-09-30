import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CapabilityRegistry, createHarnessCapabilityRegistry } from "../src/capabilities/index.ts";
import { GitCapability } from "../src/capabilities/git.ts";
import { OpenSpecCapability } from "../src/capabilities/openspec.ts";
import { RepositoryCapability } from "../src/capabilities/repository.ts";
import { RepositoryVerificationCapability } from "../src/capabilities/verification.ts";

test("el registro expone OpenSpec y reporta disponibilidad según el proyecto", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-capabilities-"));
  try {
    const registry = createHarnessCapabilityRegistry();
    assert.deepEqual(registry.list().map((capability) => capability.id), ["repository", "git", "openspec", "verification"]);
    assert.equal(registry.get("openspec")?.id, "openspec");
    assert.deepEqual(await registry.available({ cwd }), [
      { id: "repository", available: true }, { id: "git", available: false },
      { id: "openspec", available: false }, { id: "verification", available: true },
    ]);

    await mkdir(join(cwd, "openspec"));
    assert.deepEqual(await registry.available({ cwd }), [
      { id: "repository", available: true }, { id: "git", available: false },
      { id: "openspec", available: true }, { id: "verification", available: true },
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("la capability OpenSpec conserva la detección de comandos Pi", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-openspec-capability-"));
  try {
    await mkdir(join(cwd, ".pi", "prompts"), { recursive: true });
    await writeFile(join(cwd, ".pi", "prompts", "opsx-propose.md"), "generated");
    const capability = new OpenSpecCapability();
    const detection = await capability.execute({ operation: "detect", probeCli: false }, { cwd });
    assert.equal(detection.configured, true);
    assert.equal(detection.commands.propose, "/opsx-propose");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("el registro rechaza ids duplicados", () => {
  const registry = new CapabilityRegistry<{ openspec: OpenSpecCapability }>();
  registry.register("openspec", new OpenSpecCapability());
  assert.throws(() => registry.register("openspec", new OpenSpecCapability()), /Ya existe una capability/);
});

test("la capability de verificación revisa cambios sin ejecutar comandos arbitrarios", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-verification-capability-"));
  try {
    const capability = new RepositoryVerificationCapability();
    assert.equal(await capability.isAvailable({ cwd }), true);
    const review = await capability.execute({
      baseline: { available: true, status: [], files: ["README.md"] },
      current: { available: true, status: [], files: ["README.md", "src/app.ts", "tmp.log"] },
      reportedFiles: ["src/app.ts"],
    }, { cwd });
    assert.deepEqual(review, {
      changedFiles: ["src/app.ts", "tmp.log"],
      unexpectedFiles: ["tmp.log"],
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("la capability de repositorio sigue disponible sin Git y devuelve contexto con advertencias", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-repository-capability-"));
  try {
    const capability = new RepositoryCapability();
    assert.equal(await capability.isAvailable({ cwd }), true);
    const context = await capability.execute({ operation: "inspect" }, { cwd });
    assert.equal(context.git.available, false);
    assert.equal(context.warnings.some((warning) => warning.includes("no pertenece a un repositorio Git")), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("la capability Git representa la ausencia del repositorio sin fallar la solicitud", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-git-capability-"));
  try {
    const capability = new GitCapability();
    assert.equal(await capability.isAvailable({ cwd }), false);
    const snapshot = await capability.execute({ operation: "snapshot" }, { cwd });
    assert.equal(snapshot.available, false);
    assert.ok(snapshot.error);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
