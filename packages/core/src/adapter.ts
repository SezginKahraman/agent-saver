// packages/core/src/adapter.ts
import type { RawTranscript } from './types.js';

export interface WriteOpts {
  /** Fresh session UUID to assign on every message. */
  newSessionId: string;
  /** Original session UUID, recorded on the first message for lineage. */
  parentSessionId: string;
  /** Project cwd the new session belongs to (used to locate target dir). */
  targetCwd: string;
}

export interface ToolAdapter {
  /** Identifier used in metadata.source_tool. */
  readonly toolName: string;

  /** Returns the active session ID for the given cwd, or null if none. */
  detectActiveSession(cwd: string): Promise<string | null>;

  /** Reads a saved transcript by session ID. */
  readTranscript(sessionId: string, cwd: string): Promise<RawTranscript>;

  /** Writes a transcript to the tool's session store. Returns the new session ID. */
  writeTranscript(transcript: RawTranscript, opts: WriteOpts): Promise<string>;

  /** Builds a shell command the user can paste to resume the session. */
  resumeCommand(sessionId: string, sourceCwd: string, currentCwd: string): string;

  /** Extracts file paths referenced by Read/Edit/Write tool_use entries. */
  extractFilesTouched(transcript: RawTranscript): string[];

  /** Counts conversational messages (user + assistant). */
  countMessages(transcript: RawTranscript): number;

  /** Estimates total tokens. Coarse char-based heuristic is fine. */
  estimateTokens(transcript: RawTranscript): number;
}
