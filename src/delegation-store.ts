import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  checkDelegationLimits,
  isTerminalDelegatedTaskStatus,
  type DelegatedTask,
  type DelegationEvent,
  type DelegationLimits,
  DEFAULT_DELEGATION_LIMITS,
} from "./delegation.ts";

export const DELEGATION_STORE_PATH = ".harness/delegation.json";
const DELEGATION_SCHEMA_VERSION = 1;

export type DelegationStoreData = {
  schemaVersion: 1;
  tasks: DelegatedTask[];
  events: DelegationEvent[];
};

function storePath(cwd: string): string {
  return join(resolve(cwd), DELEGATION_STORE_PATH);
}

function emptyStore(): DelegationStoreData {
  return { schemaVersion: DELEGATION_SCHEMA_VERSION, tasks: [], events: [] };
}

function parseStore(value: unknown): DelegationStoreData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("El registro de delegación no es válido.");
  }
  const candidate = value as Partial<DelegationStoreData>;
  if (candidate.schemaVersion !== DELEGATION_SCHEMA_VERSION) {
    throw new Error(`El registro de delegación usa el esquema ${String(candidate.schemaVersion)}, incompatible con esta versión de yh-pi.`);
  }
  if (!Array.isArray(candidate.tasks) || !Array.isArray(candidate.events)) {
    throw new Error("El registro de delegación no contiene tareas y eventos válidos.");
  }
  return { schemaVersion: 1, tasks: candidate.tasks as DelegatedTask[], events: candidate.events as DelegationEvent[] };
}

export async function readDelegationStore(cwd: string): Promise<DelegationStoreData> {
  try {
    return parseStore(JSON.parse(await readFile(storePath(cwd), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    if (error instanceof SyntaxError) throw new Error("El registro JSON de delegación está corrupto.");
    throw error;
  }
}

export async function writeDelegationStore(cwd: string, data: DelegationStoreData): Promise<string> {
  const path = storePath(cwd);
  const directory = join(resolve(cwd), ".harness");
  await mkdir(directory, { recursive: true });
  const temporaryPath = join(directory, `.delegation.${process.pid}.${Date.now().toString(36)}.tmp`);
  try {
    await writeFile(temporaryPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return path;
}

export class DelegationRegistry {
  private readonly data: DelegationStoreData;

  constructor(data: DelegationStoreData = emptyStore()) {
    this.data = { schemaVersion: 1, tasks: [...data.tasks], events: [...data.events] };
  }

  snapshot(): DelegationStoreData {
    return { schemaVersion: 1, tasks: [...this.data.tasks], events: [...this.data.events] };
  }

  createTask(task: DelegatedTask, limits: DelegationLimits = DEFAULT_DELEGATION_LIMITS): DelegatedTask {
    if (this.data.tasks.some((item) => item.id === task.id)) throw new Error(`La tarea delegada ${task.id} ya existe.`);
    const existingChildren = this.data.tasks.filter((item) => item.parentTaskId === task.parentTaskId).length;
    const limit = checkDelegationLimits(existingChildren, task.depth, limits);
    if (!limit.allowed) throw new Error(limit.reason);
    this.data.tasks.push({ ...task });
    this.recordEvent({ taskId: task.id, type: "created", timestamp: task.createdAt, summary: "Tarea delegada registrada." });
    return { ...task };
  }

  recordEvent(event: DelegationEvent): void {
    const task = this.data.tasks.find((item) => item.id === event.taskId);
    if (!task) throw new Error(`No existe la tarea delegada ${event.taskId}.`);
    task.status = eventStatus(event.type, task.status);
    task.updatedAt = event.timestamp;
    if (event.summary) task.summary = event.summary;
    this.data.events.push({ ...event });
  }

  listForParent(parentTaskId: string): DelegatedTask[] {
    return this.data.tasks.filter((task) => task.parentTaskId === parentTaskId).map((task) => ({ ...task }));
  }

  /** After restart, running children have no continuity guarantee and become lost. */
  reconcileAfterRestart(timestamp: string): DelegationEvent[] {
    const lostEvents: DelegationEvent[] = [];
    for (const task of this.data.tasks) {
      if (isTerminalDelegatedTaskStatus(task.status) || task.status === "queued") continue;
      const event = { taskId: task.id, type: "lost" as const, timestamp, summary: "La tarea hija no pudo reconciliarse tras reiniciar la sesión." };
      this.recordEvent(event);
      lostEvents.push(event);
    }
    return lostEvents;
  }
}

function eventStatus(type: DelegationEvent["type"], current: DelegatedTask["status"]): DelegatedTask["status"] {
  if (type === "created") return current;
  if (type === "started") return "running";
  if (type === "progress") return current;
  if (type === "awaiting-input") return "awaiting-input";
  if (type === "completed") return "succeeded";
  if (type === "failed") return "failed";
  if (type === "cancelled") return "cancelled";
  return "lost";
}
