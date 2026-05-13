import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { collectGitContext } from '../src/git.js';

describe('collectGitContext', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'agent-saver-git-'));
    execSync('git init -b main', { cwd: repo });
    execSync('git config user.email t@t.t && git config user.name t', { cwd: repo, shell: '/bin/bash' });
    execSync('echo hello > a.txt && git add a.txt && git commit -m init', { cwd: repo, shell: '/bin/bash' });
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it('returns sha, branch, and dirty flag', async () => {
    const ctx = await collectGitContext(repo);
    expect(ctx.git_branch).toBe('main');
    expect(ctx.git_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(ctx.git_dirty).toBe(false);
  });

  it('detects dirty working tree', async () => {
    execSync('echo dirty > a.txt', { cwd: repo, shell: '/bin/bash' });
    const ctx = await collectGitContext(repo);
    expect(ctx.git_dirty).toBe(true);
  });

  it('returns empty object outside a git repo', async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), 'no-git-'));
    const ctx = await collectGitContext(nonRepo);
    expect(ctx).toEqual({});
    await rm(nonRepo, { recursive: true, force: true });
  });
});
