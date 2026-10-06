import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, type HarnessConfig, type McpApprovalMode } from "../src/config.ts";
import { callPiMcpAdapter, type PiMcpEventBus } from "../src/capabilities/pi-mcp-adapter.ts";

const TOOL_NAME = "harness_mcp";
const AUDIT_ENTRY = "harness-mcp-audit";
const MAX_RESULT_CHARS = 12_000;

function approvalFor(config: HarnessConfig, server: string, tool: string): McpApprovalMode | undefined {
  const entry = config.mcp.allowlist.find((candidate) => candidate.server === server && candidate.tools.includes(tool));
  return entry ? entry.approval ?? config.mcp.defaultApproval : undefined;
}

function formatArguments(value: Record<string, unknown>): string {
  const json = JSON.stringify(value, null, 2);
  return json.length > 2_000 ? `${json.slice(0, 2_000)}\n… (truncado en la vista de aprobación)` : json;
}

function formatContent(value: unknown[]): string {
  const text = value.map((part) => {
    if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
    return JSON.stringify(part);
  }).filter(Boolean).join("\n");
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n… (resultado MCP truncado)` : text;
}

function appendDecision(pi: ExtensionAPI, server: string, tool: string, decision: "approved" | "automatic" | "denied" | "failed"): void {
  pi.appendEntry(AUDIT_ENTRY, { at: new Date().toISOString(), server, tool, decision });
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerHarnessMcpTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: "MCP de yh-pi",
    description: "Invoca una tool MCP incluida en la allowlist de .harness/config.json y aplica su política de aprobación.",
    promptSnippet: "Llama una tool MCP permitida según la política configurada por la persona",
    promptGuidelines: ["Usa harness_mcp para llamadas MCP permitidas por yh-pi; no intentes usar el proxy MCP directo."],
    parameters: Type.Object({
      server: Type.String({ minLength: 1 }),
      tool: Type.String({ minLength: 1 }),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }, { additionalProperties: false }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const server = params.server.trim();
      const tool = params.tool.trim();
      const args = params.arguments ?? {};
      const approval = approvalFor(currentConfig, server, tool);
      if (!approval) {
        appendDecision(pi, server, tool, "denied");
        return errorResult(`yh-pi bloqueó ${server}/${tool}: no figura en la allowlist activa.`);
      }
      if (signal.aborted) return errorResult("La llamada MCP fue cancelada antes de aplicar la política de aprobación.");
      if (approval === "always" && !ctx.hasUI) {
        appendDecision(pi, server, tool, "denied");
        return errorResult("yh-pi bloqueó la llamada MCP porque no hay una interfaz para pedir aprobación humana.");
      }
      if (approval === "always") {
        const approved = await ctx.ui.confirm(
          `Autorizar MCP: ${server}/${tool}`,
          `Servidor: ${server}\nTool: ${tool}\nArgumentos:\n${formatArguments(args)}\n\n¿Permites esta llamada única?`,
        );
        if (!approved || signal.aborted) {
          appendDecision(pi, server, tool, "denied");
          return errorResult("La llamada MCP fue rechazada o cancelada por la persona.");
        }
        appendDecision(pi, server, tool, "approved");
      } else {
        appendDecision(pi, server, tool, "automatic");
      }

      try {
        const result = await callPiMcpAdapter({ cwd: ctx.cwd, events: pi.events as PiMcpEventBus }, { server, tool, arguments: args });
        const output = formatContent(result.content);
        return { content: [{ type: "text" as const, text: output || "La tool MCP terminó sin contenido de texto." }], details: { server, tool } };
      } catch {
        appendDecision(pi, server, tool, "failed");
        return errorResult(`Falló la llamada ${server}/${tool} a través de pi-mcp-adapter. Revisa /harness-mcp y el estado del adapter.`);
      }
    },
  });
}

export function installHarnessMcpToolGuard(pi: ExtensionAPI): void {
  pi.on("tool_call", (event) => {
    if (!currentConfig.mcp.enabled || event.toolName === TOOL_NAME) return;
    const definition = pi.getAllTools().find((tool) => tool.name === event.toolName) as
      | { sourceInfo?: { path?: string; source?: string } }
      | undefined;
    const sourcePath = definition?.sourceInfo?.path?.toLowerCase() ?? "";
    const source = definition?.sourceInfo?.source?.toLowerCase() ?? "";
    const isAdapterTool = sourcePath.includes("mcp")
      || source.includes("mcp")
      || event.toolName === "mcp"
      || event.toolName === "mcpScript";
    if (!isAdapterTool) return;
    return {
      block: true,
      reason: "yh-pi controla MCP: usa harness_mcp, que aplica la allowlist y la política de aprobación configurada.",
    };
  });
}

export function formatHarnessMcpStatus(config: HarnessConfig, pi: ExtensionAPI): string {
  const allowed = config.mcp.allowlist.flatMap((entry) => entry.tools.map((tool) => `${entry.server}/${tool} (${entry.approval ?? config.mcp.defaultApproval})`));
  const adapterLoaded = pi.getAllTools().some((tool) => {
    const sourcePath = (tool as unknown as { sourceInfo?: { path?: string } }).sourceInfo?.path?.toLowerCase() ?? "";
    return sourcePath.includes("pi-mcp-adapter");
  });
  return [
    `yh-pi MCP: ${config.mcp.enabled ? "habilitado" : "deshabilitado"}`,
    `Provider pi-mcp-adapter: ${adapterLoaded ? "detectado" : "no detectado"}`,
    `Allowlist: ${allowed.length ? allowed.join(", ") : "vacía"}`,
    `Política de aprobación default: ${config.mcp.defaultApproval}.`,
    adapterLoaded ? "El proxy/direct tools del adapter quedan bloqueados mientras yh-pi MCP está habilitado." : "Instala el provider con: pi install npm:pi-mcp-adapter",
  ].join("\n");
}

export function ensureMcpToolActive(pi: ExtensionAPI, enabled: boolean): void {
  const toolActivation = pi as ExtensionAPI & {
    getActiveTools?: () => string[];
    setActiveTools?: (tools: string[]) => void;
  };
  if (!toolActivation.getActiveTools || !toolActivation.setActiveTools) return;
  const active = toolActivation.getActiveTools();
  const next = enabled ? [...new Set([...active, TOOL_NAME])] : active.filter((name) => name !== TOOL_NAME);
  toolActivation.setActiveTools(next);
}

export function registerHarnessMcpCommand(pi: ExtensionAPI): void {
  pi.registerCommand("harness-mcp", {
    description: "Muestra el estado MCP de yh-pi y su allowlist",
    handler: async (_args, ctx: ExtensionContext) => {
      ctx.ui.notify(formatHarnessMcpStatus(currentConfig, pi), "info");
    },
  });
}

let currentConfig: HarnessConfig = structuredClone(DEFAULT_CONFIG);

export function setHarnessMcpConfig(config: HarnessConfig): void {
  currentConfig = config;
}
