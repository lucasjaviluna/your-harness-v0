import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import type { RepositoryContext } from "./task.ts";

export type ContextLevel = 0 | 1 | 2 | 3 | 4;

export interface ContextEntry {
  id: string;
  level: ContextLevel;
  source: string;
  title: string;
  content: string;
}

export interface ContextSnapshot {
  entries: ContextEntry[];
  includedLevels: ContextLevel[];
  totalChars: number;
  maxChars: number;
  omitted: number;
}

export interface ContextRequest {
  cwd: string;
  prompt: string;
  repository: RepositoryContext;
  maxLevel?: ContextLevel;
  maxChars?: number;
}

export interface ContextProvider {
  id: string;
  level: ContextLevel;
  isRelevant(request: ContextRequest): boolean;
  collect(request: ContextRequest): Promise<ContextEntry[]>;
}

const DEFAULT_CONTEXT_BUDGET = 24_000;
const ENTRY_BUDGET = 8_000;
const MAX_INDEXED_FILES = 400;
const MAX_RELEVANT_FILES = 8;
const SKIPPED_DIRECTORIES = new Set([
  ".git", ".pi", ".harness", "node_modules", "dist", "build", "coverage", ".next", "vendor",
]);
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx", ".yaml", ".yml",
  ".toml", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".html", ".css", ".scss", ".sql", ".sh",
]);
const STOP_WORDS = new Set([
  "para", "como", "desde", "sobre", "entre", "esta", "este", "esto", "that", "with", "from", "into",
  "when", "where", "what", "which", "hacer", "agregar", "cambiar", "actualizar", "implementar", "revisar",
  "fix", "add", "change", "update", "implement", "review", "the", "and", "for", "with", "that",
]);
const SENSITIVE_PATH = /(^|\/)(?:\.env(?:\.[^/]*)?|secrets?(?:[-_.][^/]*)?|credentials?(?:[-_.][^/]*)?|[^/]*private[-_]?key[^/]*)(?:\/|$)|\.(?:pem|key|p12|pfx)$/i;

function promptTerms(prompt: string): string[] {
  return [...new Set(prompt.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) ?? [])]
    .filter((term) => !STOP_WORDS.has(term));
}

function isArchitectureRequest(prompt: string): boolean {
  return /arquitect|architecture|estructura|structure|dise[nñ]o|design|modul|component|flujo|workflow|cross[- ]?module/i.test(prompt);
}

async function findCandidateFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const queue: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
  while (queue.length && files.length < MAX_INDEXED_FILES) {
    const current = queue.shift()!;
    let entries;
    try { entries = await readdir(current.directory, { withFileTypes: true }); } catch { continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (current.depth < 4 && !SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) {
          queue.push({ directory: join(current.directory, entry.name), depth: current.depth + 1 });
        }
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(join(current.directory, entry.name));
        if (files.length >= MAX_INDEXED_FILES) break;
      }
    }
  }
  return files;
}

const sources: ContextSource[] = [
  {
    id: "request",
    level: 0,
    isRelevant: () => true,
    async collect(request) {
      return [{ id: "request:prompt", level: 0, source: "prompt", title: "Solicitud original", content: request.prompt }];
    },
  },
  {
    id: "repository-metadata",
    level: 1,
    isRelevant: () => true,
    async collect({ repository }) {
      const lines = [
        `Raíz: ${repository.repoRoot ?? "no detectada"}`,
        `Git: ${repository.git.available ? `${repository.git.branch ?? "rama desconocida"}; ${repository.git.status?.length ?? 0} cambio(s)` : repository.git.error ?? "no disponible"}`,
        `Archivos principales: ${repository.mainFiles.join(", ") || "ninguno detectado"}`,
        `Instrucciones: ${repository.instructionFiles.map((file) => file.path).join(", ") || "ninguna detectada"}`,
        `Verificaciones documentadas: ${repository.verificationCommands.join(", ") || "ninguna detectada"}`,
        ...repository.warnings.map((warning) => `Aviso: ${warning}`),
      ];
      return [
        { id: "repository:metadata", level: 1, source: "repository", title: "Metadatos del repositorio", content: lines.join("\n") },
        ...repository.instructionFiles.map((file) => ({
          id: `instructions:${file.path}`,
          level: 1 as const,
          source: "repository-instructions",
          title: file.path,
          content: file.content,
        })),
      ];
    },
  },
  {
    id: "openspec-context",
    level: 2,
    isRelevant: ({ repository }) => Boolean(repository.repoRoot),
    async collect(request) {
      const root = resolve(request.repository.repoRoot ?? request.cwd);
      const terms = promptTerms(request.prompt);
      const specsRoot = join(root, "openspec", "specs");
      const changesRoot = join(root, "openspec", "changes");
      const candidates: string[] = [];
      const collectMarkdown = async (directory: string, depth = 0): Promise<void> => {
        if (depth > 4 || candidates.length >= 80) return;
        let entries;
        try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          const path = join(directory, entry.name);
          if (entry.isDirectory() && entry.name !== "archive") await collectMarkdown(path, depth + 1);
          else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) candidates.push(path);
          if (candidates.length >= 80) return;
        }
      };
      await collectMarkdown(specsRoot);
      await collectMarkdown(changesRoot);
      const ranked = candidates.map((path) => {
        const name = relative(root, path).replaceAll("\\", "/").toLocaleLowerCase();
        const score = terms.reduce((total, term) => total + (name.includes(term) ? 3 : 0), 0);
        return { path, name, score };
      }).filter((candidate) => candidate.score > 0 && !SENSITIVE_PATH.test(candidate.name))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 5);
      const entries: ContextEntry[] = [];
      for (const candidate of ranked) {
        try {
          const info = await stat(candidate.path);
          if (info.size > 100_000) continue;
          const content = (await readFile(candidate.path, "utf8")).slice(0, 4_000);
          entries.push({ id: `openspec:${candidate.name}`, level: 2, source: "openspec", title: candidate.name, content });
        } catch { /* Los artefactos OpenSpec son contexto opcional. */ }
      }
      return entries;
    },
  },
  {
    id: "relevant-files",
    level: 2,
    isRelevant: ({ repository }) => Boolean(repository.repoRoot),
    async collect(request) {
      const root = resolve(request.repository.repoRoot ?? request.cwd);
      const terms = promptTerms(request.prompt);
      if (!terms.length) return [];
      const paths = await findCandidateFiles(root);
      const ranked = paths.map((path) => {
        const normalized = relative(root, path).replaceAll("\\", "/").toLocaleLowerCase();
        const basename = normalized.split("/").at(-1) ?? normalized;
        const score = terms.reduce((total, term) => total + (basename.includes(term) ? 5 : normalized.includes(term) ? 2 : 0), 0);
        return { path, normalized, score };
      }).filter((candidate) => candidate.score > 0 && !SENSITIVE_PATH.test(candidate.normalized))
        .sort((a, b) => b.score - a.score || a.normalized.localeCompare(b.normalized))
        .slice(0, MAX_RELEVANT_FILES);

      const entries: ContextEntry[] = [];
      for (const candidate of ranked) {
        try {
          const info = await stat(candidate.path);
          if (info.size > 100_000) continue;
          const content = (await readFile(candidate.path, "utf8")).slice(0, ENTRY_BUDGET);
          if (content.includes("\0")) continue;
          entries.push({
            id: `file:${candidate.normalized}`,
            level: 2,
            source: "repository-file",
            title: candidate.normalized,
            content,
          });
        } catch { /* El archivo puede desaparecer mientras se recopila el contexto. */ }
      }
      return entries;
    },
  },
  {
    id: "architecture-documents",
    level: 3,
    isRelevant: ({ prompt, repository }) => Boolean(repository.repoRoot) && isArchitectureRequest(prompt),
    async collect(request) {
      const root = resolve(request.repository.repoRoot ?? request.cwd);
      const candidates = ["README.md", "docs/FOUNDATIONS.md", "docs/ARCHITECTURE.md"];
      const entries: ContextEntry[] = [];
      let remaining = ENTRY_BUDGET;
      for (const candidate of candidates) {
        if (remaining <= 0) break;
        const path = join(root, candidate);
        try {
          const content = (await readFile(path, "utf8")).slice(0, remaining);
          entries.push({ id: `architecture:${candidate}`, level: 3, source: "repository-architecture", title: candidate, content });
          remaining -= content.length;
        } catch { /* La documentación es optativa. */ }
      }
      return entries;
    },
  },
];

export class ContextEngine {
  constructor(private readonly providers: ContextProvider[] = sources) {}

  async compose(request: ContextRequest): Promise<ContextSnapshot> {
    const maxLevel = request.maxLevel ?? 3;
    const maxChars = Math.max(0, request.maxChars ?? DEFAULT_CONTEXT_BUDGET);
    const entries: ContextEntry[] = [];
    let remaining = maxChars;
    let omitted = 0;
    for (const provider of [...this.providers].sort((a, b) => a.level - b.level)) {
      if (provider.level > maxLevel || !provider.isRelevant(request)) continue;
      const collected = await provider.collect(request);
      for (const entry of collected) {
        if (remaining <= 0) { omitted++; continue; }
        const content = entry.content.slice(0, remaining);
        entries.push(content === entry.content ? entry : { ...entry, content });
        remaining -= content.length;
        if (content.length < entry.content.length) omitted++;
      }
    }
    return {
      entries,
      includedLevels: [...new Set(entries.map((entry) => entry.level))],
      totalChars: maxChars - remaining,
      maxChars,
      omitted,
    };
  }
}

export function formatContextSnapshot(snapshot: ContextSnapshot, options: { excludeRequest?: boolean } = {}): string {
  return snapshot.entries
    .filter((entry) => !(options.excludeRequest && entry.id === "request:prompt"))
    .map((entry) => `### ${entry.title} [nivel ${entry.level}; ${entry.source}]\n${entry.content}`)
    .join("\n\n");
}
