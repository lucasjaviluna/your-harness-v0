import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { UserProfile, WorkMode } from "./task.ts";

export const HARNESS_CONFIG_PATH = ".harness/config.json";

export type HarnessConfig = {
  defaultMode: WorkMode;
  profile: UserProfile;
  hil: { requireApproval: boolean; requireReview: boolean; recoverInterrupted: boolean };
  routing: { allowManualOverride: boolean; allowRerouteToSdd: boolean };
};

export type ConfigResult = { config: HarnessConfig; path?: string; warnings: string[]; source: "defaults" | "project" };

export type HarnessRuntimeOverrides = Partial<Pick<HarnessConfig, "defaultMode" | "profile">>;

export const DEFAULT_CONFIG: HarnessConfig = {
  defaultMode: "auto", profile: "developer",
  hil: { requireApproval: true, requireReview: true, recoverInterrupted: true },
  routing: { allowManualOverride: true, allowRerouteToSdd: true },
};

const MODES = new Set<WorkMode>(["auto", "simple", "task", "sdd"]);
const PROFILES = new Set<UserProfile>(["developer", "functional-analyst", "product-owner", "marketing", "custom"]);

export function isWorkMode(value: string): value is WorkMode { return MODES.has(value as WorkMode); }
export function isUserProfile(value: string): value is UserProfile { return PROFILES.has(value as UserProfile); }

export function readRuntimeOverrides(env: NodeJS.ProcessEnv = process.env): HarnessRuntimeOverrides {
  const overrides: HarnessRuntimeOverrides = {};
  if (env.PI_HARNESS_MODE && isWorkMode(env.PI_HARNESS_MODE)) overrides.defaultMode = env.PI_HARNESS_MODE;
  if (env.PI_HARNESS_PROFILE && isUserProfile(env.PI_HARNESS_PROFILE)) overrides.profile = env.PI_HARNESS_PROFILE;
  return overrides;
}

function applyRuntimeOverrides(config: HarnessConfig, overrides: HarnessRuntimeOverrides): HarnessConfig {
  return { ...config, ...overrides };
}

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
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
    const known = new Set(["defaultMode", "profile", "hil", "routing"]);
    for (const key of Object.keys(parsed)) if (!known.has(key)) warnings.push(`Clave desconocida ignorada: ${key}.`);
    return { config: applyRuntimeOverrides(config, runtimeOverrides), path, warnings, source: "project" };
  } catch (error) {
    return { config: applyRuntimeOverrides(structuredClone(DEFAULT_CONFIG), runtimeOverrides), path, warnings: [`No se pudo leer la configuración: ${error instanceof Error ? error.message : String(error)}`], source: "defaults" };
  }
}

export function formatConfig(result: ConfigResult): string {
  return [`Configuración: ${result.source}`, `Archivo: ${result.path ?? "defaults internos"}`, `Modo default: ${result.config.defaultMode}`, `Perfil: ${result.config.profile}`, `HIL approval: ${result.config.hil.requireApproval ? "sí" : "no"}`, `HIL review: ${result.config.hil.requireReview ? "sí" : "no"}`, `Recuperar interrupciones: ${result.config.hil.recoverInterrupted ? "sí" : "no"}`, ...result.warnings.map((warning) => `Advertencia: ${warning}`)].join("\n");
}
