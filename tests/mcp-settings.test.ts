import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import registerHarness from "../extensions/harness.ts";

test("el asistente MCP crea una allowlist y la activa desde la TUI", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-harness-mcp-settings-"));
  try {
    const commands = new Map<string, { handler: (...args: any[]) => Promise<void> }>();
    const handlers = new Map<string, (...args: any[]) => Promise<void>>();
    const notices: string[] = [];
    const pi = {
      on: (event: string, handler: (...args: any[]) => Promise<void>) => handlers.set(event, handler),
      registerCommand: (name: string, command: { handler: (...args: any[]) => Promise<void> }) => commands.set(name, command),
      registerTool: () => {},
      appendEntry: () => {},
    } as unknown as ExtensionAPI;
    registerHarness(pi);
    const choices = [
      "Añadir servidor y tools",
      "Aprobar automáticamente",
      "Activar MCP",
      "Guardar cambios",
    ];
    const inputs = ["github", "search_issues, get_issue"];
    const ctx = {
      cwd,
      hasUI: true,
      sessionManager: { getBranch: () => [] },
      ui: {
        notify: (message: string) => notices.push(message),
        select: async () => choices.shift(),
        input: async () => inputs.shift(),
      },
    } as unknown as ExtensionContext;
    await handlers.get("session_start")!({}, ctx);
    await commands.get("harness-mcp-settings")!.handler([], ctx);

    const raw = JSON.parse(await readFile(join(cwd, ".harness", "config.json"), "utf8"));
    assert.equal(raw.mcp.enabled, true);
    assert.equal(raw.mcp.defaultApproval, "always");
    assert.deepEqual(raw.mcp.allowlist, [{ server: "github", tools: ["search_issues", "get_issue"], approval: "automatic" }]);
    assert.ok(notices.some((notice) => notice.includes("Configuración MCP guardada")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
