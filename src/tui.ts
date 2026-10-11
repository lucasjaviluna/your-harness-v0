import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { HarnessConfig } from "./config.ts";
import type { HarnessTask } from "./task.ts";

export type HarnessTuiSnapshot = {
  task?: HarnessTask;
  config: HarnessConfig;
};

type MessageContext = Pick<ExtensionContext, "hasUI" | "ui">;

/** Presentation-only adapter for the harness TUI. Workflow state remains owned by the extension. */
export function showHarnessMessage(
  ctx: MessageContext,
  message: string,
  level: "info" | "warn" | "error" = "info",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
}

export function installHarnessHeader(
  ctx: ExtensionContext,
  getSnapshot: () => HarnessTuiSnapshot,
): void {
  if (ctx.mode !== "tui") return;
  ctx.ui.setHeader((_tui, theme: Theme) => ({
    render(): string[] {
      const { task, config } = getSnapshot();
      const route = task?.route ?? "sin ruta";
      const phase = task?.phase ?? "sin tarea activa";
      return [
        "",
        `${theme.fg("accent", "yh-pi")} ${theme.fg("muted", "Your Harness")} ${theme.fg("dim", `· ${config.profile} · ${route} · ${phase}`)}`,
        ...(task?.reevaluation ? [theme.fg("warning", `Esta tarea fue reevaluada: ${task.reevaluation.previousRoute} -> ${task.reevaluation.newRoute}`)] : []),
        "",
      ];
    },
    invalidate() {},
  }));
}

export function updateHarnessTui(ctx: ExtensionContext, snapshot: HarnessTuiSnapshot): void {
  if (ctx.mode !== "tui") return;
  const { task, config } = snapshot;
  const gate = task?.humanGates.find((item) => item.blocksProgress && !item.decision);
  const ui = ctx.ui;
  ui.setTitle(`yh-pi · ${config.profile}`);
  if (!task) {
    ui.setStatus("yh-pi", `perfil ${config.profile} · sin tarea activa`);
    ui.setWidget("yh-pi-state", undefined);
    return;
  }
  const gateLabel = gate
    ? `HIL: ${gate.stage === "implementation" ? "autorizar implementación" : gate.kind}`
    : "HIL: sin decisión pendiente";
  ui.setStatus("yh-pi", `${task.route ?? "sin ruta"} · ${task.phase} · ${gateLabel}`);
  ui.setWidget("yh-pi-state", [
    `yh-pi · perfil ${config.profile} · modo ${task.requestedMode}`,
    `Ruta: ${task.route ?? "sin evaluar"} · Fase: ${task.phase}`,
    gate ? `Checkpoint: ${gate.question}` : "Checkpoint: ninguno",
  ], { placement: "aboveEditor" });
}

export function showAssessmentProgress(ctx: ExtensionContext): void {
  if (ctx.mode === "tui") {
    ctx.ui.setStatus("yh-pi", "analizando solicitud y contexto…");
    ctx.ui.setWidget("yh-pi-state", [
      "yh-pi · analizando solicitud y contexto del repositorio",
      "Consultando al modelo para recomendar una ruta…",
    ], { placement: "aboveEditor" });
    return;
  }
  showHarnessMessage(ctx, "yh-pi está analizando la solicitud y el contexto del repositorio…");
}
