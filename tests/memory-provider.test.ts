import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ContextEngine } from "../src/context-engine.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { prepareHarnessTask } from "../src/harness-logic.ts";
import type { MemoryProvider, MemoryProviderContext, MemoryQuery, MemoryWriteRequest } from "../src/memory/provider.ts";
import type { RepositoryContext } from "../src/task.ts";

const repository: RepositoryContext = {
  repoRoot: "C:/fixture",
  instructionFiles: [],
  git: { available: false },
  mainFiles: [],
  verificationCommands: [],
  warnings: [],
};

function fakeProvider(overrides: Partial<Pick<MemoryProvider, "isAvailable" | "search">> = {}) {
  const calls = { available: 0, searches: [] as Array<{ query: MemoryQuery; context: MemoryProviderContext }>, stores: 0 };
  const provider: MemoryProvider = {
    id: "fake-rag",
    isAvailable: overrides.isAvailable ?? (async () => { calls.available++; return true; }),
    search: overrides.search ?? (async (query, context) => {
      calls.searches.push({ query, context });
      return {
        entries: [
          { id: "decision-1", projectId: "project-alpha", title: "Auth decision", content: "Use scoped roles.", source: "local-fixture", area: "backend", tags: ["auth"], score: 0.9 },
          { id: "decision-2", projectId: "project-alpha", title: "Second result", content: "B".repeat(5_000), source: "local-fixture", tags: [] },
          { id: "other-project", projectId: "project-beta", title: "Out of scope", content: "must not pass", source: "other", tags: [] },
        ],
      };
    }),
    async store(_entry: MemoryWriteRequest) { calls.stores++; return { stored: true, entryId: "saved-1" }; },
  };
  return { provider, calls };
}

test("sin MemoryProvider, memoria queda inactiva y no añade nivel histórico", async () => {
  const snapshot = await new ContextEngine().compose({
    cwd: "C:/fixture", prompt: "Revisar autenticación", repository, maxLevel: 4,
  });
  assert.equal(snapshot.entries.some((entry) => entry.level === 4), false);
  assert.equal(snapshot.includedLevels.includes(4), false);
  assert.deepEqual(snapshot.warnings, undefined);
});

test("un provider opcional recibe una consulta aislada y el contexto aplica límites sin guardar", async () => {
  const { provider, calls } = fakeProvider();
  const context: MemoryProviderContext = { projectId: "project-alpha", area: "backend" };
  const snapshot = await new ContextEngine({ providers: [], memory: { provider, context } }).compose({
    cwd: "C:/fixture", prompt: "Revisar autenticación", repository,
  });

  assert.equal(calls.available, 1);
  assert.equal(calls.searches.length, 1);
  assert.equal(calls.searches[0].query.query, "Revisar autenticación");
  assert.equal(calls.searches[0].query.limit, 5);
  assert.equal(calls.searches[0].query.maxChars, 4_000);
  assert.equal(calls.searches[0].context.projectId, "project-alpha");
  assert.equal(calls.searches[0].context.area, "backend");
  assert.equal(snapshot.entries.length, 2);
  assert.equal(snapshot.entries[0].level, 4);
  assert.equal(snapshot.entries[0].source, "memory:local-fixture");
  assert.equal(snapshot.entries[0].id, "memory:fake-rag:decision-1");
  assert.equal(snapshot.entries[1].content.length, 4_000 - "Use scoped roles.".length);
  assert.equal(snapshot.entries.some((entry) => entry.id.includes("other-project")), false);
  assert.match(snapshot.warnings?.[0] ?? "", /fuera del proyecto solicitado/);
  assert.equal(snapshot.totalChars, 4_000);
  assert.equal(calls.stores, 0, "la recuperación no debe guardar conocimiento automáticamente");
});

test("provider no disponible o fallido no bloquea la preparación de contexto", async () => {
  const unavailable = fakeProvider({ async isAvailable() { return false; } });
  const context = { projectId: "project-alpha" };
  const unavailableSnapshot = await new ContextEngine({ providers: [], memory: { provider: unavailable.provider, context } }).compose({
    cwd: "C:/fixture", prompt: "Buscar una decisión", repository, maxLevel: 4,
  });
  assert.equal(unavailable.calls.searches.length, 0);
  assert.match(unavailableSnapshot.warnings?.[0] ?? "", /no está disponible/);

  const failing = fakeProvider({ async search() { throw new Error("backend detail must not leak"); } });
  const failedSnapshot = await new ContextEngine({ providers: [], memory: { provider: failing.provider, context } }).compose({
    cwd: "C:/fixture", prompt: "Buscar una decisión", repository, maxLevel: 4,
  });
  assert.deepEqual(failedSnapshot.entries, []);
  assert.match(failedSnapshot.warnings?.[0] ?? "", /falló/);
  assert.doesNotMatch(failedSnapshot.warnings?.[0] ?? "", /backend detail/);

  const warningProvider = fakeProvider({ async search() { return { entries: [], warnings: ["secret endpoint token=abc"] }; } });
  const warningSnapshot = await new ContextEngine({ providers: [], memory: { provider: warningProvider.provider, context } }).compose({
    cwd: "C:/fixture", prompt: "Buscar una decisión", repository, maxLevel: 4,
  });
  assert.match(warningSnapshot.warnings?.[0] ?? "", /reportó 1 aviso/);
  assert.doesNotMatch(warningSnapshot.warnings?.[0] ?? "", /token=abc/);
});

test("la memoria no se consulta sin ámbito de proyecto explícito", async () => {
  const { provider, calls } = fakeProvider();
  const snapshot = await new ContextEngine({ providers: [], memory: { provider, context: { projectId: "   " } } }).compose({
    cwd: "C:/fixture", prompt: "Buscar una decisión", repository, maxLevel: 4,
  });
  assert.deepEqual(snapshot.entries, []);
  assert.equal(calls.available, 0);
});

test("prepareHarnessTask conecta el binding opcional al nivel histórico", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-memory-binding-"));
  const { provider, calls } = fakeProvider();
  try {
    const task = await prepareHarnessTask({
      cwd,
      request: { ok: true, prompt: "Revisar autenticación", requestedMode: "simple", analyzeOnly: false },
      config: structuredClone(DEFAULT_CONFIG),
      memory: { provider, context: { projectId: "project-alpha", area: "backend" } },
    });
    assert.equal(calls.searches.length, 1);
    assert.equal(task.contextSnapshot?.includedLevels.includes(4), true);
    assert.equal(task.contextSnapshot?.entries.some((entry) => entry.source === "memory:local-fixture"), true);
    assert.equal(calls.stores, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
