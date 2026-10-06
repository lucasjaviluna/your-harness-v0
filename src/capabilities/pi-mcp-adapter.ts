import type { CapabilityContext } from "./capability.ts";

export const PI_MCP_RUNTIME_TOOL_CALL_EVENT = "pi-mcp-adapter:runtime-tool-call:v1";

export interface PiMcpEventBus {
  emit(channel: string, data: unknown): void;
}

interface RuntimeToolCallRequest {
  version: 1;
  tool: string;
  server: string;
  args: Record<string, unknown>;
  result?: Promise<
    | { ok: true; result: { content: unknown[]; details?: unknown } }
    | { ok: false; error: Error }
  >;
}

export interface PiMcpAdapterCall {
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface PiMcpAdapterResult {
  content: unknown[];
  details?: unknown;
}

export interface PiMcpAdapterContext extends CapabilityContext {
  events: PiMcpEventBus;
}

/** Calls a configured MCP tool through pi-mcp-adapter's public cross-extension event. */
export async function callPiMcpAdapter(
  context: PiMcpAdapterContext,
  call: PiMcpAdapterCall,
): Promise<PiMcpAdapterResult> {
  const request: RuntimeToolCallRequest = {
    version: 1,
    server: call.server,
    tool: call.tool,
    args: call.arguments,
  };
  context.events.emit(PI_MCP_RUNTIME_TOOL_CALL_EVENT, request);
  if (!request.result) {
    throw new Error("pi-mcp-adapter no está cargado en esta sesión de Pi.");
  }
  const outcome = await request.result;
  if (!outcome.ok) {
    throw new Error("pi-mcp-adapter rechazó o no pudo completar la operación MCP.");
  }
  return outcome.result;
}
