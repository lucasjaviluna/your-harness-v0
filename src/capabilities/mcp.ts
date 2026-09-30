import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Capability, CapabilityContext } from "./capability.ts";

export interface McpServerDefinition {
  id: string;
  command: string;
  args?: string[];
  /** Defaults to the active repository. */
  cwd?: string;
  /** Explicit environment additions; never included in results or diagnostics. */
  env?: Record<string, string>;
}

export type McpCapabilityRequest =
  | { operation: "list_tools"; serverId: string }
  | { operation: "call_tool"; serverId: string; toolName: string; arguments?: Record<string, unknown> }
  | { operation: "list_resources"; serverId: string }
  | { operation: "read_resource"; serverId: string; uri: string }
  | { operation: "list_prompts"; serverId: string }
  | { operation: "get_prompt"; serverId: string; promptName: string; arguments?: Record<string, string> };

export interface McpCapabilityContext extends CapabilityContext {
  /** MCP servers must be explicitly configured; none are auto-discovered. */
  servers?: McpServerDefinition[];
}

export type McpCapabilityResult = Record<string, unknown>;

/**
 * Minimal MCP client adapter. It starts only the explicitly selected stdio server,
 * performs one requested protocol operation, and then closes the child process.
 */
export class McpCapability implements Capability<McpCapabilityRequest, McpCapabilityResult, McpCapabilityContext> {
  readonly id = "mcp";
  readonly description = "Conecta bajo demanda a un servidor MCP local para descubrir o invocar sus primitivas.";

  async isAvailable(context: McpCapabilityContext): Promise<boolean> {
    return (context.servers?.length ?? 0) > 0;
  }

  async execute(request: McpCapabilityRequest, context: McpCapabilityContext): Promise<McpCapabilityResult> {
    const definition = context.servers?.find((server) => server.id === request.serverId);
    if (!definition) throw new Error(`No hay un servidor MCP configurado con id "${request.serverId}".`);
    if (!definition.command.trim()) throw new Error(`El servidor MCP "${request.serverId}" no tiene un comando válido.`);

    const transport = new StdioClientTransport({
      command: definition.command,
      args: definition.args,
      cwd: definition.cwd ?? context.cwd,
      env: definition.env,
      stderr: "ignore",
    });
    const client = new Client({ name: "pi-harness", version: "0.1.0" });

    try {
      await client.connect(transport);
      switch (request.operation) {
        case "list_tools":
          return await client.listTools() as unknown as McpCapabilityResult;
        case "call_tool":
          return await client.callTool({ name: request.toolName, arguments: request.arguments ?? {} }) as unknown as McpCapabilityResult;
        case "list_resources":
          return await client.listResources() as unknown as McpCapabilityResult;
        case "read_resource":
          return await client.readResource({ uri: request.uri }) as unknown as McpCapabilityResult;
        case "list_prompts":
          return await client.listPrompts() as unknown as McpCapabilityResult;
        case "get_prompt":
          return await client.getPrompt({ name: request.promptName, arguments: request.arguments }) as unknown as McpCapabilityResult;
        default:
          throw new Error("Operación MCP no soportada.");
      }
    } catch {
      // Server errors can include arguments, environment data, or repository content.
      // Keep the public error useful without leaking the underlying message.
      throw new Error(`Falló la operación MCP "${request.operation}" en el servidor "${request.serverId}".`);
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}
