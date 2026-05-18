// packages/adapter-claude-code/src/adapter.ts
import type { RawTranscript, ToolAdapter, WriteOpts } from '@agent-saver/core';
import { detectActiveSession } from './session-detect.js';
import { readTranscript, writeTranscript } from './transcript-io.js';
import { rewriteUuids } from './uuid-rewrite.js';
import { countMessages, estimateTokens } from './transcript-stats.js';
import { extractFilesTouched } from './files-touched.js';
import { buildResumeCommand } from './resume-cmd.js';
import { resolveHome } from './paths.js';

export interface ClaudeCodeAdapterOpts {
  /** Override the home directory (useful for testing). */
  home?: string;
}

export class ClaudeCodeAdapter implements ToolAdapter {
  readonly toolName = 'claude-code';
  private readonly home: string;

  constructor(opts: ClaudeCodeAdapterOpts = {}) {
    this.home = resolveHome(opts);
  }

  async detectActiveSession(cwd: string): Promise<string | null> {
    return detectActiveSession(cwd, { home: this.home });
  }

  async readTranscript(sessionId: string, cwd: string): Promise<RawTranscript> {
    return readTranscript(sessionId, cwd, { home: this.home });
  }

  async writeTranscript(transcript: RawTranscript, opts: WriteOpts): Promise<string> {
    const rewritten = rewriteUuids(transcript, {
      newSessionId: opts.newSessionId,
      parentSessionId: opts.parentSessionId,
    });
    await writeTranscript(rewritten, opts, { home: this.home });
    return opts.newSessionId;
  }

  resumeCommand(sessionId: string, sourceCwd: string, currentCwd: string): string {
    return buildResumeCommand(sessionId, sourceCwd, currentCwd);
  }

  extractFilesTouched(transcript: RawTranscript): string[] {
    return extractFilesTouched(transcript);
  }

  countMessages(transcript: RawTranscript): number {
    return countMessages(transcript);
  }

  estimateTokens(transcript: RawTranscript): number {
    return estimateTokens(transcript);
  }
}
