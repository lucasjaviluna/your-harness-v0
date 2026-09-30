/** Stable, provider-neutral records returned by a memory backend. */
export interface MemoryEntry {
  id: string;
  projectId: string;
  title: string;
  content: string;
  source: string;
  area?: string;
  tags: string[];
  score?: number;
}

export interface MemoryQuery {
  query: string;
  area?: string;
  limit: number;
  maxChars: number;
}

export interface MemorySearchResult {
  entries: MemoryEntry[];
  warnings?: string[];
}

export interface MemoryWriteRequest {
  idempotencyKey?: string;
  title: string;
  content: string;
  source: string;
  area?: string;
  tags: string[];
}

export interface MemoryWriteResult {
  stored: boolean;
  entryId?: string;
  reason?: "duplicate" | "rejected" | "unavailable";
}

/** Explicit project scope; never infer a cross-project namespace inside a provider. */
export interface MemoryProviderContext {
  projectId: string;
  area?: string;
}

/**
 * Port implemented by a future local or RAG adapter. The harness currently
 * ships no implementation; `store` is never called automatically by retrieval.
 */
export interface MemoryProvider {
  readonly id: string;
  isAvailable(context: MemoryProviderContext): Promise<boolean>;
  search(query: MemoryQuery, context: MemoryProviderContext): Promise<MemorySearchResult>;
  store(entry: MemoryWriteRequest, context: MemoryProviderContext): Promise<MemoryWriteResult>;
}

export interface MemoryProviderBinding {
  provider: MemoryProvider;
  context: MemoryProviderContext;
}
