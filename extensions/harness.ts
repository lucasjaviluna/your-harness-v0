import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type WorkMode = "auto" | "simple" | "task" | "sdd";

type IntakeTask = {
  prompt: string;
  requestedMode: WorkMode;
  analyzeOnly: boolean;
  createdAt: string;
};

type ParsedArgs =
  | { ok: true; task: IntakeTask }
  | { ok: false; message: string };

let lastTask: IntakeTask | undefined;

const VALID_MODES = new Set<WorkMode>(["auto", "simple", "task", "sdd"]);

function parseArgs(args: string): ParsedArgs {
  let remaining = args.trim();
  let requestedMode: WorkMode = "auto";
  let analyzeOnly = false;

  const modeMatch = remaining.match(/^--mode(?:=|\s+)(\S+)(?:\s+|$)/);
  if (modeMatch) {
    const candidate = modeMatch[1] as WorkMode;
    if (!VALID_MODES.has(candidate)) {
      return {
        ok: false,
        message: `Modo inválido: ${candidate}. Usa auto, simple, task o sdd.`,
      };
    }

    requestedMode = candidate;
    remaining = remaining.slice(modeMatch[0].length).trim();
  }

  if (remaining.startsWith("--analyze-only")) {
    const suffix = remaining.slice("--analyze-only".length);
    if (suffix.length === 0 || /^\s/.test(suffix)) {
      analyzeOnly = true;
      remaining = suffix.trim();
    }
  }

  if (!remaining) {
    return {
      ok: false,
      message:
        "Falta el prompt. Uso: /harness-work [--mode auto|simple|task|sdd] [--analyze-only] <prompt>",
    };
  }

  if (remaining.startsWith("--")) {
    return {
      ok: false,
      message:
        "Opción desconocida. Uso: /harness-work [--mode auto|simple|task|sdd] [--analyze-only] <prompt>",
    };
  }

  return {
    ok: true,
    task: {
      prompt: remaining,
      requestedMode,
      analyzeOnly,
      createdAt: new Date().toISOString(),
    },
  };
}

function showMessage(ctx: { hasUI: boolean; ui: { notify(message: string, level: "info" | "warn" | "error"): void } }, message: string, level: "info" | "warn" | "error" = "info") {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
  } else {
    console.log(message);
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("harness-work", {
    description: "Inicia una tarea de desarrollo en pi-harness",
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      if (!parsed.ok) {
        showMessage(ctx, parsed.message, "warn");
        return;
      }

      lastTask = parsed.task;
      const mode = parsed.task.requestedMode;
      const suffix = parsed.task.analyzeOnly ? " (solo análisis)" : "";

      showMessage(
        ctx,
        `Tarea recibida. Modo: ${mode}${suffix}.\nPrompt: ${parsed.task.prompt}`,
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

      showMessage(
        ctx,
        [
          "Última tarea de pi-harness",
          `Modo solicitado: ${lastTask.requestedMode}`,
          `Solo análisis: ${lastTask.analyzeOnly ? "sí" : "no"}`,
          `Creada: ${lastTask.createdAt}`,
          `Prompt: ${lastTask.prompt}`,
          "Estado: recibida; la evaluación se implementará en la Fase 2/3.",
        ].join("\n"),
      );
    },
  });
}
