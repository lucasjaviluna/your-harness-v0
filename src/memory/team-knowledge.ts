import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { HarnessMemoryConfig } from "../config.ts";
import type { MemoryProvider, MemoryProviderBinding } from "./provider.ts";

type TeamKnowledgeModule = {
  MemoryService: new (repository: unknown) => unknown;
  PiHarnessMemoryProvider: new (memory: unknown) => MemoryProvider;
  SqliteAgentMemoryRepository: new (filename: string) => { close?: () => void };
};

export type TeamKnowledgeRuntime = {
  binding: MemoryProviderBinding;
  close: () => void;
};

export type TeamKnowledgeLoadResult = {
  runtime?: TeamKnowledgeRuntime;
  warning?: string;
};

/**
 * Loads the provider exported by your-team-knowledge without importing its
 * SQLite implementation into the Pi extension. The module is intentionally
 * configured by the consumer because the upstream project is currently a
 * private package and may be supplied through a workspace or local build.
 */
export async function loadTeamKnowledgeRuntime(
  cwd: string,
  config: HarnessMemoryConfig,
): Promise<TeamKnowledgeLoadResult> {
  if (!config.enabled) return {};
  if (config.provider !== "team-knowledge") return { warning: `Provider de memoria no soportado: ${config.provider}.` };
  if (!config.module?.trim()) return { warning: "Memoria habilitada, pero falta memory.module con el build de your-team-knowledge." };

  let moduleValue: TeamKnowledgeModule;
  try {
    const modulePath = isAbsolute(config.module) || config.module.startsWith(".")
      ? resolve(cwd, config.module)
      : undefined;
    const specifier = modulePath ? pathToFileURL(modulePath).href : config.module;
    moduleValue = await import(specifier) as unknown as TeamKnowledgeModule;
  } catch (error) {
    return { warning: `No se pudo cargar memory.module: ${error instanceof Error ? error.message : String(error)}` };
  }

  const database = resolve(cwd, config.database);
  try {
    const repository = new moduleValue.SqliteAgentMemoryRepository(database);
    const memory = new moduleValue.MemoryService(repository);
    const provider = new moduleValue.PiHarnessMemoryProvider(memory);
    const projectId = config.projectId?.trim() || await projectIdFromTeamMemory(cwd);
    if (!projectId) {
      repository.close?.();
      return { warning: "Memoria habilitada, pero falta memory.projectId o .team-memory.json con project_slug." };
    }
    return {
      runtime: {
        binding: { provider, context: { projectId, ...(config.defaultArea ? { area: config.defaultArea } : {}) } },
        close: () => repository.close?.(),
      },
    };
  } catch (error) {
    return { warning: `No se pudo abrir la memoria SQLite: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function projectIdFromTeamMemory(cwd: string): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(resolve(cwd, ".team-memory.json"), "utf8")) as { project_slug?: unknown };
    return typeof parsed.project_slug === "string" && parsed.project_slug.trim() ? parsed.project_slug.trim() : undefined;
  } catch {
    return undefined;
  }
}
