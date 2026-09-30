import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Capability } from "./capability.ts";

const execFileAsync = promisify(execFile);

export interface GitSnapshot {
  available: boolean;
  status: string[];
  files: string[];
  error?: string;
}

export interface GitCapabilityContext {
  cwd: string;
}

export interface GitCapabilityRequest {
  operation: "snapshot";
}

function statusFiles(status: string[]): string[] {
  return status.map((line) => line.replace(/^..\s+/, "").trim()).filter(Boolean);
}

export async function captureGitSnapshot(cwd: string): Promise<GitSnapshot> {
  try {
    const result = await execFileAsync("git", ["status", "--short"], { cwd, windowsHide: true });
    const status = result.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    return { available: true, status, files: statusFiles(status) };
  } catch (error) {
    return { available: false, status: [], files: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export class GitCapability implements Capability<GitCapabilityRequest, GitSnapshot, GitCapabilityContext> {
  readonly id = "git";
  readonly description = "Consulta el estado Git del repositorio para capturar baselines de cambios.";

  async isAvailable(context: GitCapabilityContext): Promise<boolean> {
    return (await captureGitSnapshot(context.cwd)).available;
  }

  async execute(_request: GitCapabilityRequest, context: GitCapabilityContext): Promise<GitSnapshot> {
    return captureGitSnapshot(context.cwd);
  }
}
