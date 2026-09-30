import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Capability } from "./capability.ts";

const execFileAsync = promisify(execFile);

export interface RepositorySnapshot {
  available: boolean;
  status: string[];
  files: string[];
  error?: string;
}

export interface ChangedFilesReview {
  changedFiles: string[];
  unexpectedFiles: string[];
}

export type VerificationRequest =
  | { operation: "snapshot" }
  | { operation: "review-changed-files"; baseline: RepositorySnapshot; current: RepositorySnapshot; reportedFiles: string[] };

export type VerificationResult =
  | { operation: "snapshot"; snapshot: RepositorySnapshot }
  | ({ operation: "review-changed-files" } & ChangedFilesReview);

export interface RepositoryVerificationContext {
  cwd: string;
}

function statusFiles(status: string[]): string[] {
  return status.map((line) => line.replace(/^..\s+/, "").trim()).filter(Boolean);
}

export async function captureRepositorySnapshot(cwd: string): Promise<RepositorySnapshot> {
  try {
    const result = await execFileAsync("git", ["status", "--short"], { cwd, windowsHide: true });
    const status = result.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    return { available: true, status, files: statusFiles(status) };
  } catch (error) {
    return { available: false, status: [], files: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export function reviewChangedFiles(baseline: RepositorySnapshot, current: RepositorySnapshot, reportedFiles: string[]): ChangedFilesReview {
  const baselineSet = new Set(baseline.files);
  const changedFiles = current.files.filter((file) => !baselineSet.has(file));
  const reportedSet = new Set(reportedFiles);
  const unexpectedFiles = changedFiles.filter((file) => reportedFiles.length > 0 && !reportedSet.has(file));
  return { changedFiles, unexpectedFiles };
}

export class RepositoryVerificationCapability implements Capability<VerificationRequest, VerificationResult, RepositoryVerificationContext> {
  readonly id = "verification";
  readonly description = "Captura el estado Git y contrasta los archivos modificados con el reporte del agente.";

  async isAvailable(context: RepositoryVerificationContext): Promise<boolean> {
    return (await captureRepositorySnapshot(context.cwd)).available;
  }

  async execute(request: VerificationRequest, context: RepositoryVerificationContext): Promise<VerificationResult> {
    if (request.operation === "snapshot") {
      return { operation: "snapshot", snapshot: await captureRepositorySnapshot(context.cwd) };
    }
    return {
      operation: "review-changed-files",
      ...reviewChangedFiles(request.baseline, request.current, request.reportedFiles),
    };
  }
}
