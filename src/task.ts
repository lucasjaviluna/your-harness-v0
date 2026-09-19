export type WorkMode = "auto" | "simple" | "task" | "sdd";
export type Route = "simple" | "task" | "sdd" | "clarify";
export type RouteSource = "automatic" | "manual";
export type UserProfile = "developer" | "functional-analyst" | "product-owner" | "marketing" | "custom";
export type WorkIntent = "understand" | "analyze" | "define" | "plan" | "create" | "implement" | "review" | "decide";
export type TaskPhase =
  | "intake"
  | "assessing"
  | "clarifying"
  | "awaiting-approval"
  | "planning"
  | "implementing"
  | "verifying"
  | "awaiting-review"
  | "blocked"
  | "done"
  | "cancelled"
  | "failed";
export type HumanGateKind = "clarify" | "authorize" | "review" | "recover";
export type HumanDecisionValue = "approve" | "reject" | "revise" | "cancel" | "answer";

export type RepositoryContext = {
  repoRoot?: string;
  instructionFiles: Array<{ path: string; content: string }>;
  git: { available: boolean; branch?: string; status?: string[]; error?: string };
  mainFiles: string[];
  verificationCommands: string[];
  warnings: string[];
};

export type Assessment = {
  recommendedRoute: Route;
  route: Route;
  routeSource: RouteSource;
  profile: UserProfile;
  intent: WorkIntent;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  affectedAreas: string[];
  unknowns: string[];
  evidence: string[];
};

export type HumanGate = {
  id: string;
  kind: HumanGateKind;
  reason: string;
  question: string;
  options?: string[];
  evidence: string[];
  blocksProgress: boolean;
  decision?: { value: HumanDecisionValue; note?: string; decidedAt: string };
};

export type HarnessTask = {
  id: string;
  prompt: string;
  cwd: string;
  requestedMode: WorkMode;
  analyzeOnly: boolean;
  phase: TaskPhase;
  createdAt: string;
  profile: UserProfile;
  intent?: WorkIntent;
  route?: Route;
  assessment?: Assessment;
  humanGates: HumanGate[];
  clarifications: string[];
  context?: RepositoryContext;
};

export const TASK_ENTRY_TYPE = "pi-harness.task";

const VALID_PHASES = new Set<TaskPhase>([
  "intake", "assessing", "clarifying", "awaiting-approval", "planning", "implementing",
  "verifying", "awaiting-review", "blocked", "done", "cancelled", "failed",
]);

export function createTask(input: {
  prompt: string;
  cwd: string;
  requestedMode: WorkMode;
  analyzeOnly: boolean;
  context?: RepositoryContext;
  profile?: UserProfile;
}): HarnessTask {
  const timestamp = new Date();
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `harness-${timestamp.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${suffix}`,
    prompt: input.prompt,
    cwd: input.cwd,
    requestedMode: input.requestedMode,
    analyzeOnly: input.analyzeOnly,
    phase: "intake",
    createdAt: timestamp.toISOString(),
    profile: input.profile ?? "developer",
    humanGates: [],
    clarifications: [],
    context: input.context,
  };
}

export function isHarnessTask(value: unknown): value is HarnessTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<HarnessTask>;
  return typeof task.id === "string" && typeof task.prompt === "string" &&
    typeof task.cwd === "string" && typeof task.createdAt === "string" &&
    typeof task.phase === "string" && VALID_PHASES.has(task.phase as TaskPhase);
}

export function hydrateHarnessTask(task: HarnessTask): HarnessTask {
  return {
    ...task,
    profile: task.profile ?? "developer",
    humanGates: task.humanGates ?? [],
    clarifications: task.clarifications ?? [],
  };
}

export function unresolvedGate(task: HarnessTask): HumanGate | undefined {
  return [...task.humanGates].reverse().find((gate) => gate.blocksProgress && !gate.decision);
}

export function formatTaskStatus(task: HarnessTask): string {
  const context = task.context;
  const gitState = context?.git.available
    ? `${context.git.branch ?? "rama desconocida"}; ${context.git.status?.length ?? 0} cambios reportados`
    : "no disponible";
  const assessment = task.assessment;
  const gate = unresolvedGate(task);
  return [
    "Última tarea de pi-harness",
    `ID: ${task.id}`,
    `Fase: ${task.phase}`,
    `Perfil: ${task.profile}`,
    `Modo solicitado: ${task.requestedMode}`,
    `Ruta: ${task.route ?? "sin evaluar"}`,
    `Solo análisis: ${task.analyzeOnly ? "sí" : "no"}`,
    `Creada: ${task.createdAt}`,
    `CWD: ${task.cwd}`,
    `Git: ${gitState}`,
    `Instrucciones encontradas: ${context?.instructionFiles.length ?? 0}`,
    `Comandos de verificación: ${context?.verificationCommands.length ?? 0}`,
    `Prompt: ${task.prompt}`,
    assessment ? `Evaluación: ${assessment.confidence}; ${assessment.reasons.join(" | ")}` : "Evaluación: pendiente",
    gate ? `Decisión requerida: ${gate.question}` : "Decisión requerida: ninguna",
  ].join("\n");
}
