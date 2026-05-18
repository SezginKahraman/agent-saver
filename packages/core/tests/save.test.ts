import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { save } from '../src/operations/save.js';
import { ProjectStore } from '../src/store/project-store.js';
import { useTempDir } from './helpers/temp-dir.js';
import { initGitRepo } from './helpers/git-repo.js';
import { MockAdapter } from './helpers/mock-adapter.js';

describe('save', () => {
  const getRepo = useTempDir('save-test-', initGitRepo);
  let fakeHomeForCleanup: string | undefined;
  const origHome = process.env.HOME;

  beforeEach(() => {
    fakeHomeForCleanup = undefined;
  });

  afterEach(async () => {
    if (fakeHomeForCleanup) {
      await rm(fakeHomeForCleanup, { recursive: true, force: true });
    }
    if (origHome !== undefined) process.env.HOME = origHome;
  });

  it('writes transcript and metadata to project scope', async () => {
    const repo = getRepo();
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
    const fakeHome = await mkdtemp(join(tmpdir(), 'home-'));
    fakeHomeForCleanup = fakeHome;
    process.env.HOME = fakeHome;
    const ref = await save(adapter, 'shared', { cwd: getRepo(), scope: 'global' });
    expect(ref.scope).toBe('global');
    expect(ref.path).toMatch(/\/.claude\/agents\/shared$/);
  });

  it('throws when adapter detects no active session', async () => {
    const adapter = new MockAdapter({ sessionId: null });
    await expect(save(adapter, 'x', { cwd: getRepo() })).rejects.toThrow(/no active session/i);
  });
});
