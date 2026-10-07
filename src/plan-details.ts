import type { ContextSnapshot } from "./context-engine.ts";
import { formatContextSnapshot } from "./context-engine.ts";
import { formatPlanSummary } from "./plan.ts";
import type { HarnessPlan } from "./task.ts";

/** Detailed plan rendering is loaded only when a person reviews or persists a task. */
export function formatPlanDetails(plan: HarnessPlan, contextSnapshot?: ContextSnapshot): string {
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
    ...(contextSnapshot?.entries.length ? ["", "Contexto seleccionado:", formatContextSnapshot(contextSnapshot)] : []),
  ].join("\n");
}
