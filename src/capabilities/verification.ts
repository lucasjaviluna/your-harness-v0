import type { Capability } from "./capability.ts";
import type { GitSnapshot } from "./git.ts";

export type RepositorySnapshot = GitSnapshot;

export interface ChangedFilesReview {
  changedFiles: string[];
  unexpectedFiles: string[];
}

export interface VerificationRequest {
  baseline: RepositorySnapshot;
  current: RepositorySnapshot;
  reportedFiles: string[];
}

export interface RepositoryVerificationContext {
  cwd: string;
}

export function reviewChangedFiles(baseline: RepositorySnapshot, current: RepositorySnapshot, reportedFiles: string[]): ChangedFilesReview {
  const baselineSet = new Set(baseline.files);
  const changedFiles = current.files.filter((file) => !baselineSet.has(file));
  const reportedSet = new Set(reportedFiles);
  const unexpectedFiles = changedFiles.filter((file) => reportedFiles.length > 0 && !reportedSet.has(file));
  return { changedFiles, unexpectedFiles };
}

export class RepositoryVerificationCapability implements Capability<VerificationRequest, ChangedFilesReview, RepositoryVerificationContext> {
  readonly id = "verification";
  readonly description = "Captura el estado Git y contrasta los archivos modificados con el reporte del agente.";

  async isAvailable(context: RepositoryVerificationContext): Promise<boolean> {
    void context;
    return true;
  }

  async execute(request: VerificationRequest, _context: RepositoryVerificationContext): Promise<ChangedFilesReview> {
    return reviewChangedFiles(request.baseline, request.current, request.reportedFiles);
  }
}
