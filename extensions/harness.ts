import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyAssessment, decideGate, formatAssessment, requestScopeChange, rerouteToSdd } from "../src/assessment.ts";
import { collectRepositoryContext } from "../src/intake.ts";
import { buildSimpleWorkflowPrompt, captureRepositorySnapshot, createSimpleReviewGate, parseSimpleAgentResult, reviewChangedFiles, type RepositorySnapshot } from "../src/simple.ts";
import { buildOpenSpecDelegation, createOpenSpecAuthorizationGate, createOpenSpecReviewGate, detectOpenSpec, existingOpenSpecArtifacts, extractOpenSpecArtifacts, extractOpenSpecChange, nextOpenSpecStep, type OpenSpecDetection } from "../src/openspec.ts";
import { DEFAULT_CONFIG, loadConfig, type HarnessConfig } from "../src/config.ts";
import { formatChangesReport, formatDoctorReport } from "../src/diagnostics.ts";
import { isActiveTask, recoverInterruptedTask } from "../src/recovery.ts";
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
let simpleBaseline: RepositorySnapshot | undefined;
let sddDetection: OpenSpecDetection | undefined;
let currentConfig: HarnessConfig = structuredClone(DEFAULT_CONFIG);
const VALID_MODES = new Set<WorkMode>(["auto", "simple", "task", "sdd"]);
const VALID_DECISIONS = new Set<HumanDecisionValue>(["approve", "reject", "revise", "cancel", "answer"]);

function assertCompatiblePi(pi: ExtensionAPI): void {
  const api = pi as unknown as { registerCommand?: unknown };
  if (typeof api.registerCommand !== "function") {
    throw new Error("pi-harness requiere una API de Pi compatible con registerCommand().");
  }
}

function parseArgs(args: string, defaultMode: WorkMode = "auto"): ParsedArgs {
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
    simpleBaseline = undefined;
    sddDetection = undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== TASK_ENTRY_TYPE) continue;
      if (isHarnessTask(entry.data)) lastTask = hydrateHarnessTask(entry.data);
    }
    currentConfig = (await loadConfig(ctx.cwd)).config;
    if (currentConfig.hil.recoverInterrupted && lastTask) lastTask = recoverInterruptedTask(lastTask);
  });

  pi.registerCommand("harness-sdd", {
    description: "Ejecuta el siguiente paso autorizado del workflow OpenSpec",
    handler: async (_args, ctx) => {
      if (!lastTask || lastTask.route !== "sdd") {
        showMessage(ctx, "No hay una tarea con ruta SDD. Inicia una con /harness-work --mode sdd <prompt>.", "warn");
        return;
      }
      if (lastTask.phase !== "planning") {
        showMessage(ctx, `La tarea SDD no puede avanzar desde la fase ${lastTask.phase}. Resuelve primero el checkpoint HIL pendiente.`, "warn");
        return;
      }
      if (!ctx.isIdle()) {
        showMessage(ctx, "Pi está ocupado. Espera a que termine el turno actual y vuelve a ejecutar /harness-sdd.", "warn");
        return;
      }
      sddDetection = await detectOpenSpec(lastTask.cwd);
      if (!sddDetection.configured) {
        showMessage(ctx, `OpenSpec no está configurado para Pi. ${sddDetection.findings.join(" ")} Inicialización sugerida: ${sddDetection.initCommand}`, "warn");
        return;
      }
      const previousStep = lastTask.openspec?.step;
      const step = previousStep === "proposed" ? "apply" : previousStep === "applied" ? "verify" : previousStep ?? "propose";
      const message = buildOpenSpecDelegation(lastTask, sddDetection, step);
      if (!message) {
        showMessage(ctx, `Falta el comando OpenSpec para el paso ${step}. Ejecuta "openspec update" o revisa la configuración de Pi.`, "warn");
        return;
      }
      lastTask = { ...lastTask, phase: "implementing", openspec: { ...lastTask.openspec, ...sddDetection, step } };
      pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
      showMessage(ctx, `Delegando a OpenSpec: ${sddDetection.commands[step]}`);
      pi.sendUserMessage(message, { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("harness-simple", {
    description: "Ejecuta el workflow directo de una tarea simple autorizada",
    handler: async (_args, ctx) => {
      if (!lastTask || lastTask.route !== "simple") {
        showMessage(ctx, "No hay una tarea con ruta simple. Inicia una con /harness-work --mode simple <prompt>.", "warn");
        return;
      }
      if (lastTask.phase === "awaiting-review") {
        showMessage(ctx, "La tarea ya terminó y espera revisión. Usa /harness-decide approve, revise o cancel.", "warn");
        return;
      }
      if (!["planning", "implementing"].includes(lastTask.phase)) {
        showMessage(ctx, `La tarea no puede iniciar el workflow simple desde la fase ${lastTask.phase}.`, "warn");
        return;
      }
      if (!ctx.isIdle()) {
        showMessage(ctx, "Pi está ocupado. Espera a que termine el turno actual y vuelve a ejecutar /harness-simple.", "warn");
        return;
      }
      simpleBaseline = await captureRepositorySnapshot(lastTask.cwd);
      lastTask = { ...lastTask, phase: "implementing" };
      pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
      showMessage(ctx, "Workflow simple iniciado. Pi inspeccionará, editará y verificará la tarea; luego pedirá revisión humana.");
      pi.sendUserMessage(buildSimpleWorkflowPrompt(lastTask, simpleBaseline), { deliverAs: "followUp" });
    },
  });

  pi.on("agent_end", async (event, ctx) => {
    if (lastTask?.route === "sdd" && lastTask.phase === "implementing") {
      const messages = (event as unknown as { messages?: unknown[] }).messages ?? [];
      const assistant = [...messages].reverse().find((item) => (item as { role?: string })?.role === "assistant") as { content?: unknown } | undefined;
      const text = typeof assistant?.content === "string"
        ? assistant.content
        : Array.isArray(assistant?.content)
          ? (assistant.content as Array<{ type?: string; text?: string }>).filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n")
          : "";
      const detection = sddDetection ?? await detectOpenSpec(lastTask.cwd);
      const step = lastTask.openspec?.step ?? "propose";
      const change = extractOpenSpecChange(text, detection.activeChanges) ?? lastTask.openspec?.change;
      const artifacts = extractOpenSpecArtifacts(lastTask.cwd, change);
      if (step === "propose") {
        const existingArtifacts = await existingOpenSpecArtifacts(lastTask.cwd, change);
        if (!change || existingArtifacts.length === 0) {
          lastTask = { ...lastTask, phase: "planning", result: { status: "failed", summary: "OpenSpec no produjo artefactos de propuesta reconocibles.", artifacts: [], checks: [], risks: ["No se encontró proposal.md, design.md o tasks.md para el change detectado."], nextStep: "Revisa la salida del agente y ejecuta /harness-sdd nuevamente." }, openspec: { ...lastTask.openspec!, step: "propose", change, artifacts, lastOutput: text, error: "proposal-artifacts-missing" } };
          pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
          showMessage(ctx, "La propuesta OpenSpec no produjo artefactos reconocibles. La tarea queda recuperable en planning; revisa la salida y ejecuta /harness-sdd nuevamente.", "warn");
          return;
        }
        const proposalEvidence = existingArtifacts;
        const gate = createOpenSpecAuthorizationGate(lastTask, "La propuesta OpenSpec está lista. ¿Apruebas continuar con apply?", [text.slice(0, 2000), ...proposalEvidence, ...detection.findings]);
        lastTask = { ...lastTask, phase: "awaiting-approval", openspec: { ...lastTask.openspec!, step: "proposed", change, artifacts: proposalEvidence, lastOutput: text }, humanGates: [...lastTask.humanGates, gate] };
        pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
        showMessage(ctx, "OpenSpec terminó la propuesta. Revisa sus artefactos y usa /harness-decide approve para autorizar apply.");
        return;
      }
      if (step === "apply") {
        const result = { status: "needs-input" as const, summary: text.slice(0, 500) || "OpenSpec terminó apply sin resumen textual.", artifacts, checks: [], risks: [], nextStep: "Revisar el diff y aprobar para continuar con verify." };
        const gate = createOpenSpecReviewGate(lastTask, [result.summary, ...artifacts]);
        lastTask = { ...lastTask, phase: "awaiting-review", result, openspec: { ...lastTask.openspec!, step: "applied", change, artifacts, lastOutput: text }, humanGates: [...lastTask.humanGates, gate] };
        pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
        showMessage(ctx, "OpenSpec terminó apply. Revisa el diff y usa /harness-decide approve para continuar con verify.");
        return;
      }
      const nextStep = nextOpenSpecStep(step);
      if (nextStep === "complete") {
        lastTask = { ...lastTask, phase: "done", result: { status: "completed", summary: `OpenSpec completó ${step}.`, artifacts, checks: [], risks: [] }, openspec: { ...lastTask.openspec!, step: "complete", change, artifacts, lastOutput: text } };
        pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
        showMessage(ctx, `Workflow SDD completado: ${step}.`);
        return;
      }
      if (step === "sync") {
        const gate = createOpenSpecAuthorizationGate(lastTask, "OpenSpec sincronizó las especificaciones. ¿Apruebas archivar el change?", [text.slice(0, 2000), ...artifacts]);
        lastTask = { ...lastTask, phase: "awaiting-approval", openspec: { ...lastTask.openspec!, step: "archive", change, artifacts, lastOutput: text }, humanGates: [...lastTask.humanGates, gate] };
        pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
        showMessage(ctx, "OpenSpec terminó sync. Usa /harness-decide approve para autorizar archive.");
        return;
      }
      lastTask = { ...lastTask, phase: "planning", openspec: { ...lastTask.openspec!, step: nextStep, change, artifacts, lastOutput: text } };
      pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
      showMessage(ctx, `OpenSpec terminó ${step}. El siguiente paso es ${nextStep}; ejecuta /harness-sdd.`);
      return;
    }
    if (!lastTask || lastTask.route !== "simple" || lastTask.phase !== "implementing") return;
    const messages = (event as unknown as { messages?: unknown[] }).messages ?? [];
    const assistant = [...messages].reverse().find((item) => (item as { role?: string })?.role === "assistant") as { content?: unknown } | undefined;
    const text = typeof assistant?.content === "string"
      ? assistant.content
      : Array.isArray(assistant?.content)
        ? (assistant.content as Array<{ type?: string; text?: string }>).filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n")
        : "";
    const parsed = parseSimpleAgentResult(text);
    if (!parsed) {
      const result = { status: "failed" as const, summary: "El agente no entregó un bloque HARNESS_RESULT válido.", artifacts: [], checks: [], risks: ["No se pudo verificar el resumen estructurado del workflow simple."], nextStep: "Revisar la salida del agente y ejecutar /harness-simple nuevamente." };
      lastTask = { ...lastTask, phase: "failed", result };
      pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
      showMessage(ctx, `${result.summary} ${result.nextStep}`, "warn");
      return;
    }
    const current = await captureRepositorySnapshot(lastTask.cwd);
    const review = reviewChangedFiles(simpleBaseline ?? { available: false, status: [], files: [] }, current, parsed.changedFiles);
    const result = review.unexpectedFiles.length
      ? { ...parsed, risks: [...parsed.risks, `Archivos modificados fuera del reporte: ${review.unexpectedFiles.join(", ")}.`] }
      : parsed;
    if (text.match(/^route:\s*sdd\s*$/im) && currentConfig.routing.allowRerouteToSdd) {
      lastTask = rerouteToSdd({ ...lastTask, result }, "El workflow simple detectó que el impacto excede un cambio local.");
      pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
      showMessage(ctx, "La tarea excede el alcance simple y fue reencaminada a SDD. Usa /harness-decide approve para preparar OpenSpec.", "warn");
      return;
    }
    if (!currentConfig.hil.requireReview) {
      lastTask = closeTask(lastTask, { ...result, status: "completed", nextStep: "Revisar el resultado cuando sea conveniente." });
      pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
      showMessage(ctx, `Workflow simple completado según la configuración del proyecto.\n${result.summary}`);
      return;
    }
    const gate = createSimpleReviewGate(lastTask, result, review.unexpectedFiles);
    lastTask = { ...lastTask, phase: "awaiting-review", result, humanGates: [...lastTask.humanGates, gate] };
    pi.appendEntry(TASK_ENTRY_TYPE, lastTask);
    showMessage(ctx, `Workflow simple terminado y listo para revisión humana. Usa /harness-decide approve, revise o cancel.\n${result.summary}`);
  });

  pi.registerCommand("harness-scope", {
    description: "Solicita un cambio de alcance para la tarea actual y abre un gate HIL",
    handler: async (args, ctx) => {
      if (!lastTask) {
        showMessage(ctx, "No hay ninguna tarea activa de pi-harness.", "warn");
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

  pi.registerCommand("harness-work", {
    description: "Inicia una tarea de desarrollo en pi-harness",
    handler: async (args, ctx) => {
      const loadedConfig = await loadConfig(ctx.cwd);
      currentConfig = loadedConfig.config;
      const parsed = parseArgs(args, currentConfig.defaultMode);
      if (!parsed.ok) {
        showMessage(ctx, parsed.message, "warn");
        return;
      }
      if (parsed.requestedMode !== "auto" && !currentConfig.routing.allowManualOverride) {
        showMessage(ctx, "La configuración del proyecto deshabilita overrides manuales de ruta.", "warn");
        return;
      }
      if (isActiveTask(lastTask) && lastTask?.prompt === parsed.prompt && lastTask.requestedMode === parsed.requestedMode) {
        showMessage(ctx, `La misma tarea ya está activa (${lastTask.id}); no se creó un duplicado.\n${formatTaskStatus(lastTask)}`, "warn");
        return;
      }

      const context = await collectRepositoryContext(ctx.cwd);
      lastTask = applyAssessment(createTask({
        prompt: parsed.prompt,
        cwd: ctx.cwd,
        requestedMode: parsed.requestedMode,
        analyzeOnly: parsed.analyzeOnly,
        context,
        profile: currentConfig.profile,
      }));
      if (!currentConfig.hil.requireApproval && lastTask.route === "task" && lastTask.phase === "awaiting-approval") {
        lastTask = { ...lastTask, phase: "planning", humanGates: lastTask.humanGates.filter((gate) => gate.kind !== "authorize") };
      }
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

  pi.registerCommand("harness-doctor", {
    description: "Diagnostica la configuración y capacidades de pi-harness",
    handler: async (_args, ctx) => {
      const loaded = await loadConfig(ctx.cwd);
      currentConfig = loaded.config;
      const context = await collectRepositoryContext(ctx.cwd);
      const openSpec = await detectOpenSpec(context.repoRoot ?? ctx.cwd);
      showMessage(ctx, formatDoctorReport(loaded, context, openSpec, true));
    },
  });

  pi.registerCommand("harness-changes", {
    description: "Muestra cambios Git y changes OpenSpec activos",
    handler: async (_args, ctx) => {
      const snapshot = await captureRepositorySnapshot(ctx.cwd);
      const openSpec = await detectOpenSpec(ctx.cwd);
      showMessage(ctx, formatChangesReport(snapshot, openSpec));
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
        if (currentConfig.hil.recoverInterrupted) lastTask = recoverInterruptedTask(lastTask);
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
