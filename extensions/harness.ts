import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyAssessment, decideGate, formatAssessment, requestScopeChange } from "../src/assessment.ts";
import { collectRepositoryContext } from "../src/intake.ts";
import { readTaskArtifact, writeTaskArtifact } from "../src/task-artifact.ts";
import {
  createTask,
  closeTask,
  formatTaskStatus,
  hydrateHarnessTask,
  isHarnessTask,
  TASK_ENTRY_TYPE,
  type HarnessTask,
  type HumanDecisionValue,
  type WorkMode,
} from "../src/task.ts";

type ParsedArgs =
  | { ok: true; prompt: string; requestedMode: WorkMode; analyzeOnly: boolean }
  | { ok: false; message: string };

let lastTask: HarnessTask | undefined;
const VALID_MODES = new Set<WorkMode>(["auto", "simple", "task", "sdd"]);
const VALID_DECISIONS = new Set<HumanDecisionValue>(["approve", "reject", "revise", "cancel", "answer"]);

function assertCompatiblePi(pi: ExtensionAPI): void {
  const api = pi as unknown as { registerCommand?: unknown };
  if (typeof api.registerCommand !== "function") {
    throw new Error("pi-harness requiere una API de Pi compatible con registerCommand().");
  }
}

function parseArgs(args: string): ParsedArgs {
  let remaining = args.trim();
  let requestedMode: WorkMode = "auto";
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

function showMessage(
  ctx: { hasUI: boolean; ui: { notify(message: string, level: "info" | "warn" | "error"): void } },
  message: string,
  level: "info" | "warn" | "error" = "info",
) {
  if (ctx.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
}

function parseDecision(args: string): { ok: true; value: HumanDecisionValue; note?: string } | { ok: false; message: string } {
  const [candidate, ...note] = args.trim().split(/\s+/);
  if (!candidate || !VALID_DECISIONS.has(candidate as HumanDecisionValue)) {
    return { ok: false, message: "Uso: /harness-decide <approve|reject|revise|cancel|answer> [nota]" };
  }
  return { ok: true, value: candidate as HumanDecisionValue, note: note.join(" ") || undefined };
}

async function syncTaskArtifact(task: HarnessTask): Promise<HarnessTask> {
  if (task.route !== "task") return task;
  const path = await writeTaskArtifact(task);
  if (task.artifactPath === path) return task;
  const withPath = { ...task, artifactPath: path };
  await writeTaskArtifact(withPath);
  return withPath;
}

export default function (pi: ExtensionAPI) {
  assertCompatiblePi(pi);

  pi.on("session_start", async (_event, ctx) => {
    lastTask = undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== TASK_ENTRY_TYPE) continue;
      if (isHarnessTask(entry.data)) lastTask = hydrateHarnessTask(entry.data);
    }
  });

  pi.registerCommand("harness-work", {
    description: "Inicia una tarea de desarrollo en pi-harness",
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      if (!parsed.ok) {
        showMessage(ctx, parsed.message, "warn");
        return;
      }

      const context = await collectRepositoryContext(ctx.cwd);
      lastTask = applyAssessment(createTask({
        prompt: parsed.prompt,
        cwd: ctx.cwd,
        requestedMode: parsed.requestedMode,
        analyzeOnly: parsed.analyzeOnly,
        context,
      }));
      try {
        lastTask = await syncTaskArtifact(lastTask);
      } catch (error) {
        showMessage(ctx, error instanceof Error ? `No se pudo crear el artefacto de tarea: ${error.message}` : "No se pudo crear el artefacto de tarea.", "error");
        return;
      }
      pi.appendEntry(TASK_ENTRY_TYPE, lastTask);

      const suffix = lastTask.analyzeOnly ? " (solo análisis)" : "";
      showMessage(
        ctx,
        `Tarea recibida. Modo: ${lastTask.requestedMode}${suffix}.\nID: ${lastTask.id}\n${formatAssessment(lastTask.assessment!)}${lastTask.artifactPath ? `\nArtefacto: ${lastTask.artifactPath}` : ""}${lastTask.phase === "awaiting-approval" ? "\nUsa /harness-decide approve para autorizar el objetivo y plan." : ""}${lastTask.phase === "clarifying" ? "\nUsa /harness-decide answer <respuesta> para aportar la información faltante." : ""}`,
      );
    },
  });

  pi.registerCommand("harness-status", {
    description: "Muestra el estado de la última tarea de pi-harness",
    handler: async (_args, ctx) => {
      if (!lastTask) {
        showMessage(ctx, "No hay ninguna tarea de pi-harness en esta sesión.");
        return;
      }
      showMessage(ctx, formatTaskStatus(lastTask));
    },
  });

  pi.registerCommand("harness-decide", {
    description: "Registra una decisión para el checkpoint humano actual",
    handler: async (args, ctx) => {
      if (!lastTask) {
        showMessage(ctx, "No hay ninguna tarea de pi-harness en esta sesión.", "warn");
        return;
      }
      const parsed = parseDecision(args);
      if (!parsed.ok) {
        showMessage(ctx, parsed.message, "warn");
        return;
      }
      try {
        lastTask = decideGate(lastTask, parsed.value, parsed.note);
        lastTask = await syncTaskArtifact(lastTask);
        pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
        const suffix = lastTask.assessment ? `\n${formatAssessment(lastTask.assessment)}` : "";
        showMessage(ctx, `Decisión registrada: ${parsed.value}.\nFase actual: ${lastTask.phase}.${suffix}`);
      } catch (error) {
        showMessage(ctx, error instanceof Error ? error.message : "No se pudo registrar la decisión.", "warn");
      }
    },
  });

  pi.registerCommand("harness-task-resume", {
    description: "Recupera una tarea ligera desde .harness/tasks",
    handler: async (args, ctx) => {
      try {
        const recovered = await readTaskArtifact(ctx.cwd, args.trim() || undefined);
        lastTask = recovered.task;
        lastTask = { ...lastTask, artifactPath: recovered.path };
        pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
        showMessage(ctx, `Tarea ligera recuperada desde ${recovered.path}.\n${formatTaskStatus(lastTask)}`);
      } catch (error) {
        showMessage(ctx, error instanceof Error ? error.message : "No se pudo recuperar la tarea ligera.", "warn");
      }
    },
  });

  pi.registerCommand("harness-task-status", {
    description: "Muestra el estado de la tarea ligera actual",
    handler: async (_args, ctx) => {
      if (!lastTask || lastTask.route !== "task") {
        showMessage(ctx, "No hay una tarea ligera activa en esta sesión.", "warn");
        return;
      }
      showMessage(ctx, formatTaskStatus(lastTask));
    },
  });

  pi.registerCommand("harness-task-scope", {
    description: "Solicita un cambio de alcance para la tarea ligera actual",
    handler: async (args, ctx) => {
      if (!lastTask || lastTask.route !== "task") {
        showMessage(ctx, "No hay una tarea ligera activa en esta sesión.", "warn");
        return;
      }
      try {
        lastTask = requestScopeChange(lastTask, args);
        lastTask = await syncTaskArtifact(lastTask);
        pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
        showMessage(ctx, `Cambio de alcance registrado. Debe aprobarse con /harness-decide approve.\n${formatTaskStatus(lastTask)}`);
      } catch (error) {
        showMessage(ctx, error instanceof Error ? error.message : "No se pudo registrar el cambio de alcance.", "warn");
      }
    },
  });

  pi.registerCommand("harness-task-close", {
    description: "Cierra una tarea ligera con un resultado resumido",
    handler: async (args, ctx) => {
      if (!lastTask || lastTask.route !== "task") {
        showMessage(ctx, "No hay una tarea ligera activa en esta sesión.", "warn");
        return;
      }
      if (lastTask.phase !== "awaiting-review") {
        showMessage(ctx, "Una tarea ligera solo puede cerrarse desde awaiting-review, después de verificarla.", "warn");
        return;
      }
      const summary = args.trim();
      if (!summary) {
        showMessage(ctx, "Uso: /harness-task-close <resumen del resultado>", "warn");
        return;
      }
      lastTask = closeTask(lastTask, {
        status: "completed",
        summary,
        artifacts: lastTask.artifactPath ? [lastTask.artifactPath] : [],
        checks: [],
        risks: [],
      });
      lastTask = await syncTaskArtifact(lastTask);
      pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
      showMessage(ctx, `Tarea ligera cerrada.\n${formatTaskStatus(lastTask)}`);
    },
  });
}
