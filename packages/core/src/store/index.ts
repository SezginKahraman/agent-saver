import type { AgentRef, Metadata, RawTranscript, Scope } from '../types.js';

export interface SavedAgent {
  readonly transcript: RawTranscript;
  readonly metadata: Metadata;
  readonly ref: AgentRef;
}

/**
 * Contract for any agent storage backend. `baseDir` and other concrete
 * filesystem details belong on the implementation (e.g. {@link FsStore}),
 * not on the abstraction — a future in-memory or remote store would have
 * no meaningful `baseDir`.
 */
export interface AgentStore {
  readonly scope: Scope;

  has(name: string): Promise<boolean>;
  save(name: string, transcript: RawTranscript, metadata: Metadata): Promise<AgentRef>;
  read(name: string): Promise<SavedAgent>;
  list(): Promise<AgentRef[]>;
}
