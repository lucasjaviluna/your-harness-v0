import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, saveMcpConfig, type HarnessConfig, type McpApprovalMode } from "../src/config.ts";
import { callPiMcpAdapter, type PiMcpEventBus } from "../src/capabilities/pi-mcp-adapter.ts";

const TOOL_NAME = "harness_mcp";
const AUDIT_ENTRY = "harness-mcp-audit";
const MAX_RESULT_CHARS = 12_000;
const MAX_ACTIVITY_ENTRIES = 50;
const MCP_STATUS_EVENT = "pi-mcp-adapter/status/v1";

type McpServerStatus = { name: string; status: string; toolCount: number; directToolCount: number; disabled: boolean; failedAgoSeconds?: number; blockedReason?: string };
type McpStatusSnapshot = { version: 1; servers: McpServerStatus[]; totalTools: number; connectedCount: number; disabledCount: number };
let adapterStatus: McpStatusSnapshot | undefined;

type McpActivityOutcome = "blocked" | "declined" | "cancelled" | "succeeded" | "unknown";
type McpActivity = {
  at: string;
  server: string;
  tool: string;
  approval: "human" | "automatic" | "none";
  outcome: McpActivityOutcome;
  durationMs?: number;
};

let activity: McpActivity[] = [];

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

function recordActivity(pi: ExtensionAPI, entry: McpActivity): void {
  activity = [...activity, entry].slice(-MAX_ACTIVITY_ENTRIES);
  pi.appendEntry(AUDIT_ENTRY, entry);
}

function recordImmediateActivity(
  pi: ExtensionAPI,
  server: string,
  tool: string,
  approval: McpActivity["approval"],
  outcome: McpActivityOutcome,
): void {
  recordActivity(pi, { at: new Date().toISOString(), server, tool, approval, outcome });
}

function activityRecovery(outcome: McpActivityOutcome): string {
  switch (outcome) {
    case "succeeded": return "Completada.";
    case "blocked": return "No se inició; revisa la allowlist o la interfaz disponible.";
    case "declined": return "No se inició; vuelve a solicitarla solo si corresponde.";
    case "cancelled": return "No se inició; puedes solicitarla nuevamente.";
    case "unknown": return "El resultado es desconocido; confirma el efecto antes de reintentar.";
    default: return "Revisa el estado antes de continuar.";
  }
}

export function formatMcpActivity(): string[] {
  if (!activity.length) return ["Actividad de esta sesión: todavía no hubo llamadas MCP."];
  const recent = activity.slice(-20).reverse();
  const counts = recent.reduce<Record<McpActivityOutcome, number>>((result, entry) => {
    result[entry.outcome] += 1;
    return result;
  }, { blocked: 0, declined: 0, cancelled: 0, succeeded: 0, unknown: 0 });
  return [
    `Actividad MCP de esta sesión: ${activity.length} registro(s); últimas ${recent.length}.`,
    `Resultados recientes: ${counts.succeeded} completadas, ${counts.unknown} con resultado desconocido, ${counts.declined + counts.blocked + counts.cancelled} no iniciadas.`,
    ...recent.map((entry) => `${entry.at} · ${entry.server}/${entry.tool} · ${entry.approval} · ${entry.outcome}${entry.durationMs === undefined ? "" : ` · ${entry.durationMs} ms`} · ${activityRecovery(entry.outcome)}`),
  ];
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
        recordImmediateActivity(pi, server, tool, "none", "blocked");
        return errorResult(`yh-pi bloqueó ${server}/${tool}: no figura en la allowlist activa.`);
      }
      if (signal.aborted) {
        recordImmediateActivity(pi, server, tool, "none", "cancelled");
        return errorResult("La llamada MCP fue cancelada antes de aplicar la política de aprobación.");
      }
      if (approval === "always" && !ctx.hasUI) {
        recordImmediateActivity(pi, server, tool, "none", "blocked");
        return errorResult("yh-pi bloqueó la llamada MCP porque no hay una interfaz para pedir aprobación humana.");
      }
      let activityApproval: McpActivity["approval"];
      if (approval === "always") {
        const approved = await ctx.ui.confirm(
          `Autorizar MCP: ${server}/${tool}`,
          `Servidor: ${server}\nTool: ${tool}\nArgumentos:\n${formatArguments(args)}\n\n¿Permites esta llamada única?`,
        );
        if (!approved || signal.aborted) {
          recordImmediateActivity(pi, server, tool, "human", signal.aborted ? "cancelled" : "declined");
          return errorResult("La llamada MCP fue rechazada o cancelada por la persona.");
        }
        activityApproval = "human";
      } else {
        activityApproval = "automatic";
      }

      const startedAt = Date.now();
      try {
        const result = await callPiMcpAdapter({ cwd: ctx.cwd, events: pi.events as PiMcpEventBus }, { server, tool, arguments: args });
        recordActivity(pi, { at: new Date().toISOString(), server, tool, approval: activityApproval, outcome: "succeeded", durationMs: Date.now() - startedAt });
        const output = formatContent(result.content);
        return { content: [{ type: "text" as const, text: output || "La tool MCP terminó sin contenido de texto." }], details: { server, tool } };
      } catch {
        recordActivity(pi, { at: new Date().toISOString(), server, tool, approval: activityApproval, outcome: "unknown", durationMs: Date.now() - startedAt });
        return errorResult(`El adapter no confirmó el resultado de ${server}/${tool}. Verifica el efecto antes de reintentar y revisa /harness-mcp.`);
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
  const serverStatus = adapterStatus?.servers.length
    ? adapterStatus.servers.map((server) => `${server.name}: ${server.status}; ${server.toolCount} tools detectadas; ${server.directToolCount} directas${server.failedAgoSeconds !== undefined ? `; fallo hace ${server.failedAgoSeconds}s` : ""}${server.blockedReason ? `; ${server.blockedReason}` : ""}`)
    : ["Estado de servidores: todavía no informado por pi-mcp-adapter."];
  return [
    `yh-pi MCP: ${config.mcp.enabled ? "habilitado" : "deshabilitado"}`,
    `Provider pi-mcp-adapter: ${adapterLoaded ? "detectado" : "no detectado"}`,
    `Allowlist: ${allowed.length ? allowed.join(", ") : "vacía"}`,
    `Política de aprobación default: ${config.mcp.defaultApproval}.`,
    "Tools habilitadas por yh-pi: las indicadas en la allowlist.",
    ...serverStatus,
    ...formatMcpActivity().slice(0, 2),
    adapterLoaded ? "El proxy/direct tools del adapter quedan bloqueados mientras yh-pi MCP está habilitado." : "Instala el provider con: pi install npm:pi-mcp-adapter",
  ].join("\n");
}

/** Subscribes to the adapter's read-only public runtime snapshot. */
export function installHarnessMcpStatusListener(pi: ExtensionAPI): void {
  const events = (pi as ExtensionAPI & { events?: unknown }).events as { on?: (channel: string, listener: (snapshot: unknown) => void) => void } | undefined;
  if (!events?.on) return;
  events.on(MCP_STATUS_EVENT, (snapshot) => {
    if (!snapshot || typeof snapshot !== "object") return;
    const candidate = snapshot as Partial<McpStatusSnapshot>;
    if (candidate.version !== 1 || !Array.isArray(candidate.servers)) return;
    adapterStatus = {
      version: 1,
      servers: candidate.servers.filter((server): server is McpServerStatus => Boolean(server) && typeof server.name === "string" && typeof server.status === "string" && typeof server.toolCount === "number" && typeof server.directToolCount === "number" && typeof server.disabled === "boolean"),
      totalTools: typeof candidate.totalTools === "number" ? candidate.totalTools : 0,
      connectedCount: typeof candidate.connectedCount === "number" ? candidate.connectedCount : 0,
      disabledCount: typeof candidate.disabledCount === "number" ? candidate.disabledCount : 0,
    };
  });
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

export function registerHarnessMcpHistoryCommand(pi: ExtensionAPI): void {
  pi.registerCommand("harness-mcp-history", {
    description: "Muestra la actividad MCP segura de la sesión actual",
    handler: async (_args, ctx: ExtensionContext) => {
      ctx.ui.notify(formatMcpActivity().join("\n"), "info");
    },
  });
}

/** Clears session-local activity without affecting Pi's persisted audit entries. */
export function resetHarnessMcpActivity(): void {
  activity = [];
}

function approvalLabel(approval: McpApprovalMode | undefined, fallback: McpApprovalMode): string {
  return approval ?? `default: ${fallback}`;
}

async function chooseApproval(ctx: ExtensionContext, current: McpApprovalMode | undefined, fallback: McpApprovalMode): Promise<McpApprovalMode | undefined> {
  const options = [
    `Usar política default (${fallback})`,
    "Pedir aprobación siempre",
    "Aprobar automáticamente",
  ];
  const selected = await ctx.ui.select(`Política actual: ${approvalLabel(current, fallback)}`, options);
  if (selected === options[0]) return undefined;
  return selected === options[1] ? "always" : "automatic";
}

export function registerHarnessMcpSettingsCommand(
  pi: ExtensionAPI,
  applyConfig: (config: HarnessConfig, ctx: ExtensionContext) => Promise<void> | void,
): void {
  pi.registerCommand("harness-mcp-settings", {
    description: "Edita la configuración MCP de yh-pi desde la TUI",
    handler: async (_args, ctx) => openHarnessMcpSettings(ctx, applyConfig),
  });
}

/** Opens the settings flow so hosts can load this integration only when it is used. */
export async function openHarnessMcpSettings(
  ctx: ExtensionContext,
  applyConfig: (config: HarnessConfig, ctx: ExtensionContext) => Promise<void> | void,
): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("/harness-mcp-settings requiere la TUI de Pi.", "warn");
    return;
  }
  const working = structuredClone(currentConfig);
  let changed = false;
  while (true) {
    const options = [
      working.mcp.enabled ? "Desactivar MCP" : "Activar MCP",
      `Aprobación default: ${working.mcp.defaultApproval}`,
      "Añadir servidor y tools",
      "Editar entrada allowlisted",
      "Eliminar entrada allowlisted",
      "Guardar cambios",
      "Cancelar",
    ];
    const choice = await ctx.ui.select(
      `MCP ${working.mcp.enabled ? "habilitado" : "deshabilitado"}; ${working.mcp.allowlist.reduce((count, entry) => count + entry.tools.length, 0)} tools permitidas.`,
      options,
    );
    if (choice === "Cancelar") {
      ctx.ui.notify(changed ? "Cambios MCP descartados." : "Configuración MCP sin cambios.", "info");
      return;
    }
    if (choice === "Guardar cambios") {
      if (working.mcp.enabled && working.mcp.allowlist.length === 0) {
        ctx.ui.notify("Añade al menos una entrada allowlisted antes de habilitar MCP.", "warn");
        continue;
      }
      try {
        const saved = await saveMcpConfig(ctx.cwd, working.mcp);
        await applyConfig(saved.config, ctx);
        ctx.ui.notify(`Configuración MCP guardada en ${saved.path}.`, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : "No se pudo guardar la configuración MCP.", "error");
      }
      return;
    }
    if (choice === "Activar MCP" || choice === "Desactivar MCP") {
      if (choice === "Activar MCP" && working.mcp.allowlist.length === 0) {
        ctx.ui.notify("Primero añade un servidor y al menos una tool a la allowlist.", "warn");
        continue;
      }
      working.mcp.enabled = choice === "Activar MCP";
      changed = true;
      continue;
    }
    if (choice.startsWith("Aprobación default:")) {
      working.mcp.defaultApproval = (await chooseApproval(ctx, working.mcp.defaultApproval, working.mcp.defaultApproval)) ?? working.mcp.defaultApproval;
      changed = true;
      continue;
    }
    if (choice === "Añadir servidor y tools") {
      const server = (await ctx.ui.input("Servidor MCP", "Nombre configurado en pi-mcp-adapter, por ejemplo: github"))?.trim();
      const toolInput = (await ctx.ui.input("Tools MCP", "Nombres separados por comas, por ejemplo: search_issues, get_issue"))?.trim();
      if (!server || !toolInput) {
        ctx.ui.notify("No se añadió la entrada: servidor y tools son obligatorios.", "warn");
        continue;
      }
      const tools = [...new Set(toolInput.split(",").map((tool) => tool.trim()).filter(Boolean))];
      if (!tools.length) {
        ctx.ui.notify("No se añadió la entrada: indica al menos una tool válida.", "warn");
        continue;
      }
      const approval = await chooseApproval(ctx, undefined, working.mcp.defaultApproval);
      working.mcp.allowlist.push({ server, tools, ...(approval ? { approval } : {}) });
      changed = true;
      continue;
    }
    if (working.mcp.allowlist.length === 0) {
      ctx.ui.notify("La allowlist está vacía.", "info");
      continue;
    }
    const labels = working.mcp.allowlist.map((entry, index) => `${index + 1}. ${entry.server}: ${entry.tools.join(", ")} [${approvalLabel(entry.approval, working.mcp.defaultApproval)}]`);
    const selected = await ctx.ui.select("Selecciona una entrada MCP", labels);
    const index = labels.indexOf(selected);
    if (index < 0) continue;
    if (choice === "Eliminar entrada allowlisted") {
      const confirmed = await ctx.ui.confirm("Eliminar entrada MCP", labels[index]!);
      if (confirmed) {
        working.mcp.allowlist.splice(index, 1);
        if (working.mcp.allowlist.length === 0) working.mcp.enabled = false;
        changed = true;
      }
      continue;
    }
    const entry = working.mcp.allowlist[index]!;
    const editChoice = await ctx.ui.select("Editar entrada MCP", ["Cambiar servidor", "Cambiar tools", "Cambiar política de aprobación", "Volver"]);
    if (editChoice === "Cambiar servidor") {
      const server = (await ctx.ui.input("Servidor MCP", entry.server))?.trim();
      if (!server) ctx.ui.notify("La entrada conserva su servidor actual.", "warn");
      else { entry.server = server; changed = true; }
    } else if (editChoice === "Cambiar tools") {
      const toolInput = (await ctx.ui.input("Tools MCP", entry.tools.join(", ")))?.trim();
      const tools = toolInput ? [...new Set(toolInput.split(",").map((tool) => tool.trim()).filter(Boolean))] : [];
      if (!tools.length) ctx.ui.notify("La entrada conserva sus tools: indica al menos una.", "warn");
      else { entry.tools = tools; changed = true; }
    } else if (editChoice === "Cambiar política de aprobación") {
      entry.approval = await chooseApproval(ctx, entry.approval, working.mcp.defaultApproval);
      changed = true;
    }
  }
}

let currentConfig: HarnessConfig = structuredClone(DEFAULT_CONFIG);

export function setHarnessMcpConfig(config: HarnessConfig): void {
  currentConfig = config;
}
