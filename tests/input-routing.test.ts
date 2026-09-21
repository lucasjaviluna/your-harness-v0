import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import registerHarness from "../extensions/harness.ts";
import { TASK_ENTRY_TYPE, createTask } from "../src/task.ts";

test("un prompt equivalente solo permite crear una tarea nueva o no continuar", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-routing-"));
  try {
    await mkdir(join(cwd, ".harness"));
    await writeFile(join(cwd, ".harness", "config.json"), JSON.stringify({ captureInput: true }));
    const previous = { ...createTask({
      prompt: 'Cambiar label de boton login de "Login" a "Ingresar"',
      cwd, requestedMode: "auto", analyzeOnly: false,
    }), phase: "cancelled" as const, route: "simple" as const };
    const handlers = new Map<string, (...args: any[]) => Promise<any>>();
    const entries: unknown[] = [];
    const pi = {
      on: (event: string, handler: (...args: any[]) => Promise<any>) => handlers.set(event, handler),
      registerCommand: () => {},
      appendEntry: (...args: unknown[]) => entries.push(args),
    } as unknown as ExtensionAPI;
    registerHarness(pi);
    let compared = false;
    let choice = "No continuar";
    const ctx = {
      cwd, hasUI: true, model: { id: "test-model" }, signal: undefined, isIdle: () => false,
      sessionManager: { getBranch: () => [{ type: "custom", customType: TASK_ENTRY_TYPE, data: previous }] },
      modelRegistry: { complete: async () => { compared = true; return { stopReason: "stop", content: [{ type: "text", text: "SAME" }] }; } },
      ui: {
        notify: () => {},
        select: async (_title: string, options: string[]) => {
          assert.deepEqual(options, ["Crear tarea nueva en yh-pi", "No continuar"]);
          return choice;
        },
      },
    } as unknown as ExtensionContext;
    await handlers.get("session_start")!({}, ctx);
    const prompt = 'Nuevo texto para call to action de pantalla de login, pasa de "Login" a "Ingresar"';
    const outcome = await handlers.get("input")!({ text: prompt, source: "interactive" }, ctx);
    assert.deepEqual(outcome, { action: "handled" });
    assert.equal(compared, true);
    assert.equal(entries.length, 0);
    choice = "Crear tarea nueva en yh-pi";
    const retry = await handlers.get("input")!({ text: prompt, source: "interactive" }, ctx);
    assert.deepEqual(retry, { action: "handled" });
    assert.equal(entries.length, 1);
    assert.notEqual((entries[0] as [string, { id: string }])[1].id, previous.id);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
