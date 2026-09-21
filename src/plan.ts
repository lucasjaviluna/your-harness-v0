import type { HarnessPlan, HarnessTask } from "./task.ts";

export function createHarnessPlan(task: HarnessTask): HarnessPlan {
  const route = task.route ?? "task";
  const steps = route === "sdd"
    ? ["Revisar el impacto y los requisitos", "Preparar la propuesta OpenSpec", "Revisar y autorizar la propuesta", "Aplicar, verificar y sincronizar el cambio"]
    : route === "simple"
      ? ["Inspeccionar el contexto mínimo", "Implementar el cambio localizado", "Ejecutar verificaciones proporcionales", "Presentar el resultado para revisión"]
      : route === "clarify"
        ? ["Aclarar el objetivo y el alcance", "Reevaluar la ruta y preparar el plan"]
        : ["Analizar el contexto relevante", "Definir el plan y sus criterios de finalización", "Implementar el cambio aprobado", "Ejecutar verificaciones", "Presentar el resultado para revisión"];
  return {
    id: `${task.id}-plan`,
    version: 1,
    objective: task.prompt,
    scope: task.scope ?? task.prompt,
    steps,
    affectedFiles: task.context?.mainFiles ?? [],
    verificationCommands: task.context?.verificationCommands ?? [],
    risks: task.assessment?.reasons ?? [],
    assumptions: task.assessment?.unknowns ?? [],
  };
}

export function reviseHarnessPlan(plan: HarnessPlan, changes: Partial<Omit<HarnessPlan, "id" | "version" | "approvedVersion" | "approvedAt">>): HarnessPlan {
  return { ...plan, ...changes, version: plan.version + 1, approvedVersion: undefined, approvedAt: undefined };
}

export function formatPlanSummary(plan: HarnessPlan): string {
  return [
    `Plan ${plan.id} · versión ${plan.version}`,
    `Objetivo: ${plan.objective}`,
    `Alcance: ${plan.scope}`,
    `Pasos: ${plan.steps.length}`,
    `Archivos potenciales: ${plan.affectedFiles.length || "no determinados"}`,
    `Verificaciones: ${plan.verificationCommands.length || "por determinar"}`,
    `Riesgos: ${plan.risks.length || "ninguno detectado"}`,
  ].join("\n");
}

export function formatPlanDetails(plan: HarnessPlan): string {
  return [
    formatPlanSummary(plan),
    "",
    "Pasos:",
    ...plan.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Archivos potenciales:",
    ...(plan.affectedFiles.length ? plan.affectedFiles.map((file) => `- ${file}`) : ["- Todavía no determinados"]),
    "",
    "Verificaciones:",
    ...(plan.verificationCommands.length ? plan.verificationCommands.map((command) => `- ${command}`) : ["- Se determinarán durante el análisis"]),
    "",
    "Riesgos:",
    ...(plan.risks.length ? plan.risks.map((risk) => `- ${risk}`) : ["- Ninguno detectado"]),
    "",
    "Supuestos o incógnitas:",
    ...(plan.assumptions.length ? plan.assumptions.map((item) => `- ${item}`) : ["- Ninguno"]),
  ].join("\n");
}
