import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import registerHarness from "../extensions/harness.ts";

test("instala el header en session_start antes de esperar la configuración y solo una vez", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-startup-"));
  try {
    const handlers = new Map<string, (...args: any[]) => Promise<any>>();
    registerHarness({
      on: (event: string, handler: (...args: any[]) => Promise<any>) => handlers.set(event, handler),
      registerCommand: () => {},
    } as unknown as ExtensionAPI);

    const calls: string[] = [];
    const ctx = {
      mode: "tui", cwd,
      sessionManager: { getBranch: () => [] },
      ui: {
        setHeader: () => calls.push("header"),
        setTitle: () => calls.push("title"),
        setStatus: () => calls.push("status"),
        setWidget: () => calls.push("widget"),
      },
    } as unknown as ExtensionContext;

    const startup = handlers.get("session_start")!({}, ctx);
    assert.deepEqual(calls, ["header"]);
    await startup;
    assert.deepEqual(calls, ["header", "title", "status", "widget"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
