import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { McpCapability } from "../src/capabilities/mcp.ts";

const capability = new McpCapability();
const context = {
  cwd: process.cwd(),
  servers: [{
    id: "everything",
    command: process.execPath,
    args: [resolve("node_modules/@modelcontextprotocol/server-everything/dist/index.js")],
  }],
};

test("Everything: descubre tools, resources y prompts a través de MCP stdio", async () => {
  const tools = await capability.execute({ operation: "list_tools", serverId: "everything" }, context) as { tools: Array<{ name: string }> };
  assert.ok(tools.tools.some((tool) => tool.name === "echo"));

  const resources = await capability.execute({ operation: "list_resources", serverId: "everything" }, context) as { resources: unknown[] };
  assert.ok(resources.resources.length > 0);

  const prompts = await capability.execute({ operation: "list_prompts", serverId: "everything" }, context) as { prompts: Array<{ name: string }> };
  assert.ok(prompts.prompts.some((prompt) => prompt.name === "simple-prompt"));
});

test("Everything: invoca una tool y lee un recurso usando solo operaciones explícitas", async () => {
  const echo = await capability.execute({
    operation: "call_tool", serverId: "everything", toolName: "echo", arguments: { message: "pi-harness-mcp-ok" },
  }, context) as { content: Array<{ type: string; text?: string }> };
  assert.ok(echo.content.some((item) => item.type === "text" && item.text?.includes("pi-harness-mcp-ok")));

  const resource = await capability.execute({
    operation: "read_resource", serverId: "everything", uri: "demo://resource/dynamic/text/1",
  }, context) as { contents: Array<{ text?: string }> };
  assert.ok(resource.contents.length > 0);
  assert.equal(await capability.isAvailable({ cwd: context.cwd, servers: context.servers }), true);
});

test("la capability no inicia servidores no configurados y oculta errores internos", async () => {
  assert.equal(await capability.isAvailable({ cwd: process.cwd() }), false);
  await assert.rejects(
    capability.execute({ operation: "list_tools", serverId: "missing" }, { cwd: process.cwd() }),
    /No hay un servidor MCP configurado/,
  );

  await assert.rejects(
    capability.execute({ operation: "list_tools", serverId: "broken" }, {
      cwd: process.cwd(), servers: [{ id: "broken", command: "this-command-does-not-exist-pi-harness" }],
    }),
    (error: unknown) => error instanceof Error
      && error.message.includes('Falló la operación MCP "list_tools"')
      && !error.message.includes("this-command-does-not-exist"),
  );
});
