import type { Assessment, HarnessTask, HumanDecisionValue, HumanGate, Route, TaskPhase, WorkIntent, WorkResult } from "./task.ts";
import { closeTask, unresolvedGate } from "./task.ts";

type Signal = { pattern: RegExp; reason: string; area: string };

const SDD_SIGNALS: Signal[] = [
  { pattern: /\b(api|contrato|contract|endpoint|p[uú]blica|p[uú]blico)\b/i, reason: "Puede cambiar un contrato público o entre componentes.", area: "contracts" },
  { pattern: /\b(migraci[oó]n|schema|esquema|base de datos|database|datos persistentes)\b/i, reason: "Involucra migración o evolución de datos persistentes.", area: "data" },
  { pattern: /\b(seguridad|security|permiso|permisos|rol(?:es)?|authorization|autenticaci[oó]n|auth)\b/i, reason: "Afecta seguridad, autenticación o autorización.", area: "security" },
  { pattern: /\b(arquitectura|architecture|compatibilidad|breaking change|retrocompatibilidad)\b/i, reason: "Declara impacto arquitectónico o de compatibilidad.", area: "architecture" },
  { pattern: /\b(toda la aplicaci[oó]n|todos los m[oó]dulos|cross[- ]?module|varios servicios)\b/i, reason: "El alcance explícito abarca múltiples áreas del sistema.", area: "cross-module" },
];

const TASK_SIGNALS: Signal[] = [
  { pattern: /\b(reintentos|retry|refresh token|flujo|workflow|integraci[oó]n|sincronizaci[oó]n)\b/i, reason: "Requiere coordinar varias decisiones dentro de un alcance acotado.", area: "workflow" },
  { pattern: /\b(varios|m[uú]ltiples|multiple|end[- ]?to[- ]?end)\b/i, reason: "Sugiere más de un componente o paso de trabajo.", area: "multi-step" },
];

const SIMPLE_SIGNALS: Signal[] = [
  { pattern: /\b(typo|ortograf[ií]a|texto|copy|mensaje de error|literal)\b/i, reason: "Describe un cambio textual o localizado.", area: "local" },
  { pattern: /\b(renombrar|rename)\b.*\b(variable|constante|funci[oó]n local)\b/i, reason: "Describe un cambio mecánico y local.", area: "local" },
  { pattern: /\b(un archivo|archivo .*\.(ts|tsx|js|jsx|css|html|md|json))\b/i, reason: "Acota explícitamente el cambio a un archivo.", area: "local" },
];

const VAGUE_SCOPE = /\b(mejorar|optimizar|actualizar|arreglar|revisar|cambiar|implementar)\b/i;
const TARGET_DETAIL = /\b(para |en |del |de |con |que |mensaje|variable|archivo|api|sesiones|autenticaci[oó]n|login|error|bot[oó]n|pantalla)\b/i;

export function inferIntent(task: Pick<HarnessTask, "prompt" | "analyzeOnly">): WorkIntent {
  if (task.analyzeOnly || /\b(analizar|evaluar|entender|investigar)\b/i.test(task.prompt)) return "analyze";
  if (/\b(dise[nñ]ar|definir|especificar)\b/i.test(task.prompt)) return "define";
  if (/\b(revisar|review)\b/i.test(task.prompt)) return "review";
  return "implement";
}

function matchingSignals(text: string, signals: Signal[]): Signal[] {
  return signals.filter((signal) => signal.pattern.test(text));
}

function hasDecisiveUnknown(text: string, taskSignals: Signal[], simpleSignals: Signal[], sddSignals: Signal[]): boolean {
  if (sddSignals.length > 0 || simpleSignals.length > 0) return false;
  if (/^\s*(mejorar|optimizar|actualizar|arreglar|revisar)\s+(el |la |los |las )?(sistema|flujo|proceso|experiencia)/i.test(text)) return true;
  return VAGUE_SCOPE.test(text) && !TARGET_DETAIL.test(text) && taskSignals.length === 0;
}

function buildEvidence(task: HarnessTask): string[] {
  const evidence = [`Prompt: ${task.prompt}`];
  if (task.clarifications.length > 0) evidence.push(`Aclaraciones: ${task.clarifications.join(" | ")}`);
  if (task.context?.repoRoot) evidence.push(`Repositorio detectado: ${task.context.repoRoot}`);
  if (task.context?.instructionFiles.length) evidence.push(`Instrucciones del repositorio: ${task.context.instructionFiles.map((file) => file.path).join(", ")}`);
  if (task.context?.verificationCommands.length) evidence.push(`Verificaciones disponibles: ${task.context.verificationCommands.join(", ")}`);
  return evidence;
}

export function assessTask(task: HarnessTask): Assessment {
  const text = [task.prompt, ...task.clarifications].join("\n");
  const sddSignals = matchingSignals(text, SDD_SIGNALS);
  const taskSignals = matchingSignals(text, TASK_SIGNALS);
  const simpleSignals = matchingSignals(text, SIMPLE_SIGNALS);
  const unknown = hasDecisiveUnknown(text, taskSignals, simpleSignals, sddSignals);
  const intent = inferIntent(task);
  let recommendedRoute: Route;
  let confidence: Assessment["confidence"];
  let reasons: string[];
  let unknowns: string[] = [];

  if (sddSignals.length > 0) {
    recommendedRoute = "sdd";
    confidence = "high";
    reasons = sddSignals.map((signal) => signal.reason);
  } else if (unknown) {
    recommendedRoute = "clarify";
    confidence = "low";
    reasons = ["No hay información suficiente para acotar el objetivo y el comportamiento esperado."];
    unknowns = ["Qué resultado concreto se espera y qué parte del sistema queda dentro del alcance."];
  } else if (taskSignals.length > 0) {
    recommendedRoute = "task";
    confidence = "medium";
    reasons = taskSignals.map((signal) => signal.reason);
  } else if (simpleSignals.length > 0) {
    recommendedRoute = "simple";
    confidence = "high";
    reasons = simpleSignals.map((signal) => signal.reason);
  } else {
    recommendedRoute = "task";
    confidence = "low";
    reasons = ["El alcance parece implementable, pero no hay evidencia suficiente para tratarlo como un cambio local simple."];
  }

  const hasManualOverride = task.requestedMode !== "auto" && recommendedRoute !== "clarify";
  const route = hasManualOverride ? task.requestedMode : recommendedRoute;
  if (hasManualOverride) reasons = [`La persona solicitó la ruta ${task.requestedMode}.`, ...reasons];

  return {
    recommendedRoute, route, routeSource: hasManualOverride ? "manual" : "automatic", profile: task.profile,
    intent, confidence, reasons,
    affectedAreas: [...new Set([...sddSignals, ...taskSignals, ...simpleSignals].map((signal) => signal.area))],
    unknowns, evidence: buildEvidence(task),
  };
}

export function createAssessmentGate(assessment: Assessment): HumanGate | undefined {
  if (assessment.route === "clarify") return {
    id: `gate-${Date.now().toString(36)}`, kind: "clarify", reason: "Falta información decisiva para escoger una ruta segura.",
    question: assessment.unknowns[0] ?? "¿Qué información falta para definir el alcance?", options: ["answer", "cancel"],
    evidence: assessment.evidence, blocksProgress: true,
  };
  if (assessment.route === "sdd") return {
    id: `gate-${Date.now().toString(36)}`, kind: "authorize", reason: "La tarea requiere una ruta SDD antes de crear artefactos OpenSpec.",
    question: "La recomendación es SDD. ¿Autorizas preparar la propuesta OpenSpec?", options: ["approve", "reject", "revise", "cancel"],
    evidence: assessment.evidence, blocksProgress: true,
  };
  if (assessment.route === "task") return {
    id: `gate-${Date.now().toString(36)}`, kind: "authorize", reason: "La tarea ligera necesita aprobación de su objetivo y plan antes de implementar.",
    question: "¿Apruebas el objetivo y el plan de esta tarea ligera?", options: ["approve", "reject", "revise", "cancel"],
    evidence: assessment.evidence, blocksProgress: true,
  };
}

export function applyAssessment(task: HarnessTask): HarnessTask {
  const assessment = assessTask(task);
  const gate = task.analyzeOnly ? undefined : createAssessmentGate(assessment);
  const phase: TaskPhase = task.analyzeOnly ? "done" : gate?.kind === "clarify" ? "clarifying" : gate ? "awaiting-approval" : "planning";
  return {
    ...task, assessment, intent: assessment.intent, route: assessment.route, phase,
    humanGates: gate ? [...task.humanGates, gate] : task.humanGates,
  };
}

export function decideGate(task: HarnessTask, value: HumanDecisionValue, note?: string): HarnessTask {
  const gate = unresolvedGate(task);
  if (!gate) throw new Error("No hay ninguna decisión pendiente para esta tarea.");
  if (gate.options && !gate.options.includes(value)) throw new Error(`La decisión ${value} no es válida para este checkpoint.`);
  if (gate.kind === "clarify" && value === "answer" && !note?.trim()) throw new Error("La respuesta de aclaración no puede estar vacía.");
  const decidedGate: HumanGate = { ...gate, decision: { value, note: note?.trim() || undefined, decidedAt: new Date().toISOString() } };
  const humanGates = task.humanGates.map((item) => item.id === gate.id ? decidedGate : item);
  if (value === "cancel") return { ...task, humanGates, phase: "cancelled" };
  if (gate.kind === "clarify" && value === "answer") {
    return applyAssessment({ ...task, humanGates, clarifications: [...task.clarifications, note!.trim()], phase: "assessing" });
  }
  if (gate.kind === "authorize" && value === "approve") return { ...task, humanGates, phase: "planning" };
  if (gate.kind === "review") {
    if (value === "approve") {
      if (task.result?.checks.some((check) => check.status === "failed")) {
        throw new Error("No se puede aprobar un resultado con verificaciones fallidas. Usa revise o corrige el problema antes de aprobar.");
      }
      if (task.route === "sdd" && task.openspec?.step === "applied") {
        return { ...task, humanGates, phase: "planning", openspec: { ...task.openspec, step: "verify" } };
      }
      return closeTask({ ...task, humanGates }, { ...task.result!, status: "completed" });
    }
    if (value === "revise") return { ...task, humanGates, phase: "planning" };
  }
  return { ...task, humanGates, phase: "blocked" };
}

export function rerouteToSdd(task: HarnessTask, reason: string): HarnessTask {
  const assessment: Assessment = {
    recommendedRoute: "sdd", route: "sdd", routeSource: "automatic", profile: task.profile,
    intent: task.intent ?? "implement", confidence: "high", reasons: [reason],
    affectedAreas: [...new Set([...(task.assessment?.affectedAreas ?? []), "scope-growth"])],
    unknowns: task.assessment?.unknowns ?? [],
    evidence: [...(task.assessment?.evidence ?? []), `Reencaminamiento: ${reason}`],
  };
  const gate = createAssessmentGate(assessment)!;
  return { ...task, route: "sdd", assessment, phase: "awaiting-approval", humanGates: [...task.humanGates, gate] };
}

export function requestScopeChange(task: HarnessTask, newScope: string): HarnessTask {
  const scope = newScope.trim();
  if (!scope) throw new Error("El nuevo alcance no puede estar vacío.");
  const gate: HumanGate = {
    id: `gate-${Date.now().toString(36)}`, kind: "authorize", reason: "El alcance de la tarea cambió y requiere una nueva aprobación.",
    question: `¿Apruebas el nuevo alcance? ${scope}`, options: ["approve", "reject", "revise", "cancel"],
    evidence: [`Alcance anterior: ${task.scope ?? task.prompt}`, `Alcance propuesto: ${scope}`], blocksProgress: true,
  };
  return { ...task, scope, phase: "awaiting-approval", humanGates: [...task.humanGates, gate] };
}

export function formatAssessment(assessment: Assessment): string {
  return [
    "Evaluación de pi-harness", `Ruta recomendada: ${assessment.recommendedRoute}`,
    `Ruta seleccionada: ${assessment.route} (${assessment.routeSource})`, `Confianza: ${assessment.confidence}`,
    `Intención: ${assessment.intent}`, `Razones: ${assessment.reasons.join(" | ")}`,
    `Áreas afectadas: ${assessment.affectedAreas.join(", ") || "sin clasificar"}`,
    `Incógnitas: ${assessment.unknowns.join(" | ") || "ninguna decisiva"}`,
    `Evidencia: ${assessment.evidence.join(" | ")}`,
  ].join("\n");
}
