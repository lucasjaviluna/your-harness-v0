import { applyAssessment } from "./assessment.ts";
import { createHarnessCapabilityRegistry, type HarnessCapabilities } from "./capabilities/index.ts";
import type { CapabilityRegistry } from "./capabilities/registry.ts";
import { ContextEngine } from "./context-engine.ts";
import { loadConfig, type HarnessConfig } from "./config.ts";
import { isActiveTask } from "./recovery.ts";
import { writeTaskArtifact } from "./task-artifact.ts";
import { createTask, type HarnessTask, type UserProfile, type WorkMode } from "./task.ts";
import { createHarnessPlan } from "./plan.ts";

export type ParsedWorkRequest =
  | { ok: true; prompt: string; requestedMode: WorkMode; analyzeOnly: boolean }
  | { ok: false; message: string };

const VALID_MODES = new Set<WorkMode>(["auto", "simple", "task", "sdd"]);

export type IntentComparison = "same" | "different" | "uncertain";

export function parseIntentComparison(output: string): IntentComparison {
  const verdict = output.trim().toUpperCase().match(/^(SAME|DIFFERENT|UNCERTAIN)\b/)?.[1];
  if (verdict === "SAME") return "same";
  if (verdict === "DIFFERENT") return "different";
  return "uncertain";
}

export async function compareCancelledRequest(
  task: HarnessTask | undefined,
  request: ParsedWorkRequest & { ok: true },
  classify: (previous: string, current: string) => Promise<IntentComparison>,
): Promise<IntentComparison | "not-cancelled"> {
  if (!task || task.phase !== "cancelled") return "not-cancelled";
  if (task.prompt.trim() === request.prompt.trim()) return "same";
  try {
    return await classify(task.prompt, request.prompt);
  } catch {
    return "uncertain";
  }
}

/**
 * Compares a new request with any existing task, regardless of its phase.
 * The caller owns the human decision and the resulting state transition.
 */
export async function compareTaskRequest(
  task: HarnessTask,
  request: ParsedWorkRequest & { ok: true },
  classify: (previous: string, current: string) => Promise<IntentComparison>,
): Promise<IntentComparison> {
  if (task.prompt.trim() === request.prompt.trim()) return "same";
  try {
    return await classify(task.prompt, request.prompt);
  } catch {
    return "uncertain";
  }
}

export function parseWorkRequest(args: string, defaultMode: WorkMode = "auto"): ParsedWorkRequest {
  let remaining = args.trim();
  let requestedMode: WorkMode = defaultMode;
  let analyzeOnly = false;

  while (remaining.startsWith("--")) {
    const modeMatch = remaining.match(/^--mode(?:=|\s+)(\S+)(?:\s+|$)/);
    if (modeMatch) {
      const candidate = modeMatch[1] as WorkMode;
      if (!VALID_MODES.has(candidate)) {
        return { ok: false, message: `Modo inválido: ${candidate}. Usa auto, simple, task o sdd.` };
      }
      requestedMode = candidate;
      remaining = remaining.slice(modeMatch[0].length).trim();
      continue;
    }

    if (remaining === "--analyze-only" || remaining.startsWith("--analyze-only ")) {
      analyzeOnly = true;
      remaining = remaining.slice("--analyze-only".length).trim();
      continue;
    }

    return {
      ok: false,
      message: "Opción desconocida. Uso: /harness-work [--mode auto|simple|task|sdd] [--analyze-only] <prompt>",
    };
  }

  if (!remaining) {
    return {
      ok: false,
      message: "Falta el prompt. Uso: /harness-work [--mode auto|simple|task|sdd] [--analyze-only] <prompt>",
    };
  }

  return { ok: true, prompt: remaining, requestedMode, analyzeOnly };
}

async function persistTaskArtifact(task: HarnessTask): Promise<HarnessTask> {
  if (task.route !== "task") return task;
  const path = await writeTaskArtifact(task);
  if (task.artifactPath === path) return task;
  const withPath = { ...task, artifactPath: path };
  await writeTaskArtifact(withPath);
  return withPath;
}

export async function prepareHarnessTask(input: {
  cwd: string;
  request: ParsedWorkRequest & { ok: true };
  config: HarnessConfig;
  profile?: UserProfile;
  activeTask?: HarnessTask;
  capabilities?: CapabilityRegistry<HarnessCapabilities>;
}): Promise<HarnessTask> {
  const { request, config } = input;
  if (request.requestedMode !== "auto" && !config.routing.allowManualOverride) {
    throw new Error("La configuración del proyecto deshabilita overrides manuales de ruta.");
  }
  if (isActiveTask(input.activeTask) && input.activeTask?.prompt === request.prompt && input.activeTask.requestedMode === request.requestedMode) {
    throw new Error(`La misma tarea ya está activa (${input.activeTask.id}); no se creó un duplicado.`);
  }

  const capabilities = input.capabilities ?? createHarnessCapabilityRegistry();
  const repository = capabilities.get("repository");
  if (!repository) throw new Error("La capability de repositorio no está registrada.");
  const context = await repository.execute({ operation: "inspect" }, { cwd: input.cwd });
  let task = applyAssessment(createTask({
    prompt: request.prompt,
    cwd: input.cwd,
    requestedMode: request.requestedMode,
    analyzeOnly: request.analyzeOnly,
    context,
    profile: input.profile ?? config.profile,
  }));
  task = {
    ...task,
    contextSnapshot: await new ContextEngine().compose({
      cwd: input.cwd,
      prompt: request.prompt,
      repository: context,
      maxLevel: task.route === "simple" ? 2 : 3,
    }),
  };
  task = { ...task, plan: createHarnessPlan(task) };
  if (!config.hil.requireApproval && task.route === "task" && task.phase === "awaiting-approval") {
    task = { ...task, phase: "planning", humanGates: task.humanGates.filter((gate) => gate.kind !== "authorize") };
  }
  return persistTaskArtifact(task);
}

export async function prepareHarnessTaskFromArgs(input: {
  cwd: string;
  args: string;
  config?: HarnessConfig;
  activeTask?: HarnessTask;
  profile?: UserProfile;
  capabilities?: CapabilityRegistry<HarnessCapabilities>;
}): Promise<HarnessTask> {
  const config = input.config ?? (await loadConfig(input.cwd)).config;
  const request = parseWorkRequest(input.args, config.defaultMode);
  if (!request.ok) throw new Error(request.message);
  return prepareHarnessTask({ ...input, request, config });
}
