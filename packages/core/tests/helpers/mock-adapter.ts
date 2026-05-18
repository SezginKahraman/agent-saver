import type { RawTranscript } from '../../src/types.js';
import type { ToolAdapter, WriteOpts } from '../../src/adapter.js';

export interface MockAdapterOpts {
  sessionId?: string | null;
  raw?: string;
  filesTouched?: readonly string[];
  msgCount?: number;
  tokens?: number;
}

/**
 * Configurable ToolAdapter test double.
 *
 * - `detectActiveSession()` returns `sessionId` (default `'mock-session-id'`,
 *   pass `null` to simulate "no active session").
 * - `readTranscript()` returns `{ raw }` (default a 2-message stub).
 * - `writeTranscript()` records its opts in `lastWriteOpts` and returns the
 *   new session id.
 * - `resumeCommand()` produces the canonical `cd … && claude --resume …`
 *   string (or just `claude --resume …` when source matches current).
 */
export class MockAdapter implements ToolAdapter {
  readonly toolName = 'mock';
  public lastWriteOpts?: WriteOpts;
  public sessionId: string | null;
  public raw: string;
  public filesTouched: readonly string[];
  public msgCount: number;
  public tokens: number;

  constructor(opts: MockAdapterOpts = {}) {
    this.sessionId = opts.sessionId === undefined ? 'mock-session-id' : opts.sessionId;
    this.raw = opts.raw ?? '{"m":1}\n{"m":2}\n';
    this.filesTouched = opts.filesTouched ?? ['src/x.ts'];
    this.msgCount = opts.msgCount ?? 2;
    this.tokens = opts.tokens ?? 100;
  }

  async detectActiveSession(): Promise<string | null> {
    return this.sessionId;
  }

  async readTranscript(): Promise<RawTranscript> {
    return { raw: this.raw };
  }

  async writeTranscript(_t: RawTranscript, opts: WriteOpts): Promise<string> {
    this.lastWriteOpts = opts;
    return opts.newSessionId;
  }

  resumeCommand(sessionId: string, sourceCwd: string, currentCwd: string): string {
    if (sourceCwd === currentCwd) return `claude --resume ${sessionId}`;
    return `cd ${sourceCwd} && claude --resume ${sessionId}`;
  }

  extractFilesTouched(): string[] {
    return [...this.filesTouched];
  }

  countMessages(): number {
    return this.msgCount;
  }

  estimateTokens(): number {
    return this.tokens;
  }
}
