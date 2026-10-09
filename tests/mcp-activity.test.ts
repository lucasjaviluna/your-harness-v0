import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  formatMcpActivity,
  registerHarnessMcpTool,
  resetHarnessMcpActivity,
  setHarnessMcpConfig,
} from "../extensions/mcp-adapter-integration.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

test("un resultado MCP ambiguo queda registrado y no se reintenta automáticamente", async () => {
  let adapterCalls = 0;
  let registered: { execute: (...args: any[]) => Promise<any> } | undefined;
  const pi = {
    events: {
      emit: (_channel: string, request: { result?: Promise<never> }) => {
        adapterCalls += 1;
        request.result = Promise.reject(new Error("resultado no confirmado"));
      },
    },
    registerTool: (tool: { execute: (...args: any[]) => Promise<any> }) => { registered = tool; },
    appendEntry: () => {},
  } as unknown as ExtensionAPI;
  const config = structuredClone(DEFAULT_CONFIG);
  config.mcp = {
    enabled: true,
    defaultApproval: "automatic",
    allowlist: [{ server: "demo", tools: ["write"], approval: "automatic" }],
  };
  setHarnessMcpConfig(config);
  resetHarnessMcpActivity();
  registerHarnessMcpTool(pi);

  const result = await registered!.execute(
    "call-1",
    { server: "demo", tool: "write", arguments: { value: "x" } },
    new AbortController().signal,
    undefined,
    { cwd: ".", hasUI: false },
  );

  assert.equal(adapterCalls, 1);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /no confirmó el resultado/);
  const history = formatMcpActivity().join("\n");
  assert.match(history, /demo\/write · automatic · unknown/);
  assert.match(history, /confirma el efecto antes de reintentar/);
  resetHarnessMcpActivity();
  setHarnessMcpConfig(structuredClone(DEFAULT_CONFIG));
});
