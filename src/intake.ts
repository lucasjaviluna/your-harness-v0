import { execFile as execFileCallback } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";
import type { RepositoryContext } from "./task.ts";

const execFile = promisify(execFileCallback);
const MAX_INSTRUCTION_CHARS = 8_000;
const MAX_MAIN_FILES = 50;
const INSTRUCTION_NAMES = ["AGENTS.md", "CLAUDE.md"];

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function findGitRoot(cwd: string): Promise<string | undefined> {
  try {
    const result = await execFile("git", ["rev-parse", "--show-toplevel"], { cwd, windowsHide: true });
    const root = result.stdout.trim();
    return root ? resolve(root) : undefined;
  } catch { return undefined; }
}

function ancestorDirectories(start: string, stopAt?: string): string[] {
  const result: string[] = [];
  let current = resolve(start);
  const stop = stopAt ? resolve(stopAt) : undefined;
  while (true) {
    result.push(current);
    if (stop && current === stop) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return result;
}

async function collectInstructions(cwd: string, repoRoot?: string) {
  const paths = new Set<string>();
  const directories = ancestorDirectories(cwd, repoRoot);
  if (repoRoot) directories.push(resolve(repoRoot));
  for (const directory of directories) {
    for (const name of INSTRUCTION_NAMES) {
      const path = join(directory, name);
      if (await fileExists(path)) paths.add(path);
    }
  }
  const files: Array<{ path: string; content: string }> = [];
  let remaining = MAX_INSTRUCTION_CHARS;
  for (const path of paths) {
    if (remaining <= 0) break;
    const content = await readFile(path, "utf8");
    const excerpt = content.slice(0, remaining);
    files.push({ path, content: excerpt });
    remaining -= excerpt.length;
  }
  return files;
}

async function collectGitContext(cwd: string, repoRoot?: string): Promise<RepositoryContext["git"]> {
  if (!repoRoot) return { available: false, error: "No se encontró un repositorio Git." };
  try {
    const result = await execFile("git", ["status", "--short", "--branch"], { cwd: repoRoot, windowsHide: true });
    const lines = result.stdout.split(/\r?\n/).filter(Boolean);
    return { available: true, branch: lines[0]?.replace(/^##\s*/, ""), status: lines.slice(1) };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function collectProjectFiles(repoRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(repoRoot, { withFileTypes: true });
    return entries.filter((entry) => ![".git", "node_modules", ".pi"].includes(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_MAIN_FILES)
      .map((entry) => entry.name + (entry.isDirectory() ? "/" : ""));
  } catch { return []; }
}

async function collectVerificationCommands(repoRoot: string): Promise<string[]> {
  const packagePath = join(repoRoot, "package.json");
  if (!(await fileExists(packagePath))) return [];
  try {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { scripts?: Record<string, string> };
    const scripts = packageJson.scripts ?? {};
    return ["test", "check", "lint", "typecheck", "build"].filter((name) => scripts[name])
      .map((name) => name === "test" ? "npm test" : `npm run ${name}`);
  } catch { return []; }
}

export async function collectRepositoryContext(cwd: string): Promise<RepositoryContext> {
  const normalizedCwd = resolve(cwd);
  const repoRoot = await findGitRoot(normalizedCwd);
  const effectiveRoot = repoRoot ?? normalizedCwd;
  const [instructionFiles, git, mainFiles, verificationCommands] = await Promise.all([
    collectInstructions(normalizedCwd, repoRoot),
    collectGitContext(normalizedCwd, repoRoot),
    collectProjectFiles(effectiveRoot),
    collectVerificationCommands(effectiveRoot),
  ]);
  const warnings: string[] = [];
  if (!repoRoot) warnings.push("El directorio actual no pertenece a un repositorio Git.");
  if (!instructionFiles.length) warnings.push("No se encontraron AGENTS.md ni CLAUDE.md.");
  if (git.error) warnings.push(`Git: ${git.error}`);
  return { repoRoot, instructionFiles, git, mainFiles, verificationCommands, warnings };
}
