import type { AgentRef, Metadata, RawTranscript, Scope } from '../types.js';

export interface SavedAgent {
  transcript: RawTranscript;
  metadata: Metadata;
  ref: AgentRef;
}

export interface AgentStore {
  readonly scope: Scope;
  readonly baseDir: string;

  has(name: string): Promise<boolean>;
  save(name: string, transcript: RawTranscript, metadata: Metadata): Promise<AgentRef>;
  read(name: string): Promise<SavedAgent>;
  list(): Promise<AgentRef[]>;
}
