import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { UserProfile, WorkMode } from "./task.ts";

export const HARNESS_CONFIG_PATH = ".harness/config.json";

export type McpApprovalMode = "always" | "automatic";

export type HarnessConfig = {
  defaultMode: WorkMode;
  profile: UserProfile;
  captureInput: boolean;
  hil: { requireApproval: boolean; requireReview: boolean; recoverInterrupted: boolean };
  routing: { allowManualOverride: boolean; allowRerouteToSdd: boolean };
  mcp: {
    enabled: boolean;
    defaultApproval: McpApprovalMode;
    allowlist: Array<{ server: string; tools: string[]; approval?: McpApprovalMode }>;
  };
};

export type ConfigResult = { config: HarnessConfig; path?: string; warnings: string[]; source: "defaults" | "project" };

export type HarnessRuntimeOverrides = Partial<Pick<HarnessConfig, "defaultMode" | "profile" | "captureInput">>;
export type McpConfig = HarnessConfig["mcp"];

export const DEFAULT_CONFIG: HarnessConfig = {
  defaultMode: "auto", profile: "developer", captureInput: false,
  hil: { requireApproval: true, requireReview: true, recoverInterrupted: true },
  routing: { allowManualOverride: true, allowRerouteToSdd: true },
  mcp: { enabled: false, defaultApproval: "always", allowlist: [] },
};

const MODES = new Set<WorkMode>(["auto", "simple", "task", "sdd"]);
const PROFILES = new Set<UserProfile>(["developer", "functional-analyst", "product-owner", "marketing", "custom"]);

export function isWorkMode(value: string): value is WorkMode { return MODES.has(value as WorkMode); }
export function isUserProfile(value: string): value is UserProfile { return PROFILES.has(value as UserProfile); }

export function readRuntimeOverrides(env: NodeJS.ProcessEnv = process.env): HarnessRuntimeOverrides {
  const overrides: HarnessRuntimeOverrides = {};
  if (env.PI_HARNESS_MODE && isWorkMode(env.PI_HARNESS_MODE)) overrides.defaultMode = env.PI_HARNESS_MODE;
  if (env.PI_HARNESS_PROFILE && isUserProfile(env.PI_HARNESS_PROFILE)) overrides.profile = env.PI_HARNESS_PROFILE;
  if (env.PI_HARNESS_CAPTURE_INPUT !== undefined) overrides.captureInput = ["1", "true", "yes"].includes(env.PI_HARNESS_CAPTURE_INPUT.toLowerCase());
  return overrides;
}

function applyRuntimeOverrides(config: HarnessConfig, overrides: HarnessRuntimeOverrides): HarnessConfig {
  return { ...config, ...overrides };
}

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

/** Writes only the MCP section and preserves the project's other yh-pi settings. */
export async function saveMcpConfig(cwd: string, mcp: McpConfig): Promise<ConfigResult> {
  const path = join(resolve(cwd), HARNESS_CONFIG_PATH);
  let parsed: Record<string, unknown> = {};
  if (await fileExists(path)) {
    try {
      const value = JSON.parse(await readFile(path, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("la raíz debe ser un objeto JSON");
      parsed = value as Record<string, unknown>;
    } catch (error) {
      throw new Error(`No se pudo actualizar ${HARNESS_CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({
    ...parsed,
    mcp: {
      enabled: mcp.enabled,
      defaultApproval: mcp.defaultApproval,
      allowlist: mcp.allowlist.map((entry) => ({
        server: entry.server,
        tools: entry.tools,
        ...(entry.approval ? { approval: entry.approval } : {}),
      })),
    },
  }, null, 2)}\n`, "utf8");
  return loadConfig(cwd, {});
}

export async function loadConfig(cwd: string, runtimeOverrides: HarnessRuntimeOverrides = readRuntimeOverrides()): Promise<ConfigResult> {
  const path = join(resolve(cwd), HARNESS_CONFIG_PATH);
  if (!(await fileExists(path))) return { config: applyRuntimeOverrides(structuredClone(DEFAULT_CONFIG), runtimeOverrides), warnings: [], source: "defaults" };
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const warnings: string[] = [];
    const config = structuredClone(DEFAULT_CONFIG);
    if (typeof parsed.defaultMode === "string" && MODES.has(parsed.defaultMode as WorkMode)) config.defaultMode = parsed.defaultMode as WorkMode;
    else if (parsed.defaultMode !== undefined) warnings.push("defaultMode inválido; se usa auto.");
    if (typeof parsed.profile === "string" && PROFILES.has(parsed.profile as UserProfile)) config.profile = parsed.profile as UserProfile;
    else if (parsed.profile !== undefined) warnings.push("profile inválido; se usa developer.");
    if (parsed.captureInput !== undefined) {
      if (typeof parsed.captureInput === "boolean") config.captureInput = parsed.captureInput;
      else warnings.push("captureInput inválido; se conserva el valor default.");
    }
    const hil = parsed.hil && typeof parsed.hil === "object" ? parsed.hil as Record<string, unknown> : undefined;
    const routing = parsed.routing && typeof parsed.routing === "object" ? parsed.routing as Record<string, unknown> : undefined;
    for (const key of ["requireApproval", "requireReview", "recoverInterrupted"] as const) {
      if (hil?.[key] !== undefined) {
        if (typeof hil[key] === "boolean") config.hil[key] = hil[key] as boolean;
        else warnings.push(`hil.${key} inválido; se conserva el valor default.`);
      }
    }
    for (const key of ["allowManualOverride", "allowRerouteToSdd"] as const) {
      if (routing?.[key] !== undefined) {
        if (typeof routing[key] === "boolean") config.routing[key] = routing[key] as boolean;
        else warnings.push(`routing.${key} inválido; se conserva el valor default.`);
      }
    }
    const mcp = parsed.mcp && typeof parsed.mcp === "object" ? parsed.mcp as Record<string, unknown> : undefined;
    if (mcp?.enabled !== undefined) {
      if (typeof mcp.enabled === "boolean") config.mcp.enabled = mcp.enabled;
      else warnings.push("mcp.enabled inválido; se conserva desactivado.");
    }
    if (mcp?.defaultApproval !== undefined) {
      if (mcp.defaultApproval === "always" || mcp.defaultApproval === "automatic") config.mcp.defaultApproval = mcp.defaultApproval;
      else warnings.push("mcp.defaultApproval inválido; se conserva always.");
    }
    if (mcp?.allowlist !== undefined) {
      if (Array.isArray(mcp.allowlist)) {
        config.mcp.allowlist = mcp.allowlist.flatMap((entry) => {
          if (!entry || typeof entry !== "object") {
            warnings.push("Entrada MCP inválida; se ignora.");
            return [];
          }
          const candidate = entry as Record<string, unknown>;
          const server = typeof candidate.server === "string" ? candidate.server.trim() : "";
          const tools = Array.isArray(candidate.tools)
            ? [...new Set(candidate.tools.filter((tool): tool is string => typeof tool === "string").map((tool) => tool.trim()).filter(Boolean))]
            : [];
          if (!server || tools.length === 0 || tools.length !== (candidate.tools as unknown[] | undefined)?.length) {
            warnings.push("Entrada MCP inválida (requiere server y tools no vacíos); se ignora.");
            return [];
          }
          const approval = candidate.approval;
          if (approval !== undefined && approval !== "always" && approval !== "automatic") {
            warnings.push(`mcp.allowlist[${server}].approval inválido; se aplica la política default.`);
            return [{ server, tools }];
          }
          return [{ server, tools, ...(approval ? { approval } : {}) }];
        });
      } else warnings.push("mcp.allowlist inválida; se conserva vacía.");
    }
    if (config.mcp.allowlist.length === 0) config.mcp.enabled = false;
    const known = new Set(["defaultMode", "profile", "captureInput", "hil", "routing", "mcp"]);
    for (const key of Object.keys(parsed)) if (!known.has(key)) warnings.push(`Clave desconocida ignorada: ${key}.`);
    return { config: applyRuntimeOverrides(config, runtimeOverrides), path, warnings, source: "project" };
  } catch (error) {
    return { config: applyRuntimeOverrides(structuredClone(DEFAULT_CONFIG), runtimeOverrides), path, warnings: [`No se pudo leer la configuración: ${error instanceof Error ? error.message : String(error)}`], source: "defaults" };
  }
}

export function formatConfig(result: ConfigResult): string {
  return [`Configuración: ${result.source}`, `Archivo: ${result.path ?? "defaults internos"}`, `Modo default: ${result.config.defaultMode}`, `Perfil: ${result.config.profile}`, `Captura input: ${result.config.captureInput ? "sí" : "no"}`, `HIL approval: ${result.config.hil.requireApproval ? "sí" : "no"}`, `HIL review: ${result.config.hil.requireReview ? "sí" : "no"}`, `Recuperar interrupciones: ${result.config.hil.recoverInterrupted ? "sí" : "no"}`, `MCP: ${result.config.mcp.enabled ? "habilitado" : "deshabilitado"} (${result.config.mcp.allowlist.reduce((count, entry) => count + entry.tools.length, 0)} tools allowlisted; aprobación default: ${result.config.mcp.defaultApproval})`, ...result.warnings.map((warning) => `Advertencia: ${warning}`)].join("\n");
}
