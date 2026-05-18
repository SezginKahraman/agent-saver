// packages/core/tests/load.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from '../src/operations/load.js';
import { ProjectStore } from '../src/store/project-store.js';
import type { Metadata, RawTranscript } from '../src/types.js';
import type { ToolAdapter, WriteOpts } from '../src/adapter.js';

class MockAdapter implements ToolAdapter {
  readonly toolName = 'mock';
  public lastWriteOpts?: WriteOpts;
  async detectActiveSession() {
    return null;
  }
  async readTranscript(): Promise<RawTranscript> {
    return { raw: '' };
  }
  async writeTranscript(_t: RawTranscript, opts: WriteOpts): Promise<string> {
    this.lastWriteOpts = opts;
    return opts.newSessionId;
  }
  resumeCommand(sessionId: string, sourceCwd: string, currentCwd: string): string {
    if (sourceCwd === currentCwd) return `claude --resume ${sessionId}`;
    return `cd ${sourceCwd} && claude --resume ${sessionId}`;
  }
  extractFilesTouched() {
    return [];
  }
  countMessages() {
    return 0;
  }
  estimateTokens() {
    return 0;
  }
}

function metaFixture(name: string, sourceCwd: string): Metadata {
  return {
    name,
    created_at: '2026-05-13T00:00:00Z',
    agent_saver_version: '0.1.0',
    source_tool: 'mock',
    source_session_id: 'orig-session',
    source_cwd: sourceCwd,
    message_count: 5,
    estimated_tokens: 100,
    files_touched: [],
  };
}

describe('load', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'load-test-'));
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it('loads project-scoped agent and returns resume command for same cwd', async () => {
    const store = new ProjectStore(repo);
    await store.save('jacob', { raw: 'x' }, metaFixture('jacob', repo));

    const adapter = new MockAdapter();
    const result = await load(adapter, 'jacob', { cwd: repo });

    expect(result.agent.name).toBe('jacob');
    expect(result.newSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result.resumeCommand).toBe(`claude --resume ${result.newSessionId}`);
    expect(adapter.lastWriteOpts?.parentSessionId).toBe('orig-session');
    expect(adapter.lastWriteOpts?.targetCwd).toBe(repo);
  });

  it('throws when name does not exist', async () => {
    const adapter = new MockAdapter();
    await expect(load(adapter, 'missing', { cwd: repo })).rejects.toThrow(/not found/i);
  });
});
