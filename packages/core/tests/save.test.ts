// packages/core/tests/save.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { save } from '../src/operations/save.js';
import { ProjectStore } from '../src/store/project-store.js';
import type { ToolAdapter, WriteOpts } from '../src/adapter.js';
import type { RawTranscript } from '../src/types.js';

class MockAdapter implements ToolAdapter {
  readonly toolName = 'mock';
  constructor(
    public sessionId: string | null = 'mock-session-id',
    public raw = '{"m":1}\n{"m":2}\n',
  ) {}
  async detectActiveSession(): Promise<string | null> {
    return this.sessionId;
  }
  async readTranscript(): Promise<RawTranscript> {
    return { raw: this.raw };
  }
  async writeTranscript(_t: RawTranscript, _opts: WriteOpts): Promise<string> {
    throw new Error('not used in save');
  }
  resumeCommand(): string {
    return 'mock-resume';
  }
  extractFilesTouched(): string[] {
    return ['src/x.ts'];
  }
  countMessages(): number {
    return 2;
  }
  estimateTokens(): number {
    return 100;
  }
}

describe('save', () => {
  let repo: string;
  let fakeHomeForCleanup: string | undefined;
  const origHome = process.env.HOME;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'save-test-'));
    fakeHomeForCleanup = undefined;
    execSync('git init -b main', { cwd: repo });
    execSync('git config user.email t@t.t && git config user.name t', { cwd: repo, shell: '/bin/bash' });
    await writeFile(join(repo, 'a.txt'), 'hi');
    execSync('git add . && git commit -m init', { cwd: repo, shell: '/bin/bash' });
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
    if (fakeHomeForCleanup) {
      await rm(fakeHomeForCleanup, { recursive: true, force: true });
    }
    if (origHome !== undefined) process.env.HOME = origHome;
  });

  it('writes transcript and metadata to project scope', async () => {
    const adapter = new MockAdapter();
    const ref = await save(adapter, 'jacob', { cwd: repo, description: 'auth' });

    expect(ref.name).toBe('jacob');
    expect(ref.scope).toBe('project');
    expect(ref.metadata.source_tool).toBe('mock');
    expect(ref.metadata.source_session_id).toBe('mock-session-id');
    expect(ref.metadata.message_count).toBe(2);
    expect(ref.metadata.estimated_tokens).toBe(100);
    expect(ref.metadata.files_touched).toEqual(['src/x.ts']);
    expect(ref.metadata.git_branch).toBe('main');
    expect(ref.metadata.git_dirty).toBe(false);
    expect(ref.metadata.git_sha).toMatch(/^[0-9a-f]{40}$/);

    // verify on disk
    const reread = await new ProjectStore(repo).read('jacob');
    expect(reread.metadata.description).toBe('auth');
  });

  it('honors scope: global', async () => {
    const adapter = new MockAdapter();
    // Use HOME override so we don't pollute the real home dir
    const fakeHome = await mkdtemp(join(tmpdir(), 'home-'));
    fakeHomeForCleanup = fakeHome;
    process.env.HOME = fakeHome;
    const ref = await save(adapter, 'shared', { cwd: repo, scope: 'global' });
    expect(ref.scope).toBe('global');
    expect(ref.path).toMatch(/\/.claude\/agents\/shared$/);
  });

  it('throws when adapter detects no active session', async () => {
    const adapter = new MockAdapter(null);
    await expect(save(adapter, 'x', { cwd: repo })).rejects.toThrow(/no active session/i);
  });
});
