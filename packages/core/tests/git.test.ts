import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { collectGitContext } from '../src/git.js';
import { useTempDir } from './helpers/temp-dir.js';
import { initGitRepo } from './helpers/git-repo.js';

describe('collectGitContext', () => {
  const getRepo = useTempDir('agent-saver-git-', initGitRepo);
  const getNonRepo = useTempDir('no-git-');

  it('returns sha, branch, and dirty flag', async () => {
    const ctx = await collectGitContext(getRepo());
    expect(ctx.git_branch).toBe('main');
    expect(ctx.git_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(ctx.git_dirty).toBe(false);
  });

  it('detects dirty working tree', async () => {
    const repo = getRepo();
    execSync('echo dirty > a.txt', { cwd: repo, shell: '/bin/bash' });
    const ctx = await collectGitContext(repo);
    expect(ctx.git_dirty).toBe(true);
  });

  it('returns empty object outside a git repo', async () => {
    const ctx = await collectGitContext(getNonRepo());
    expect(ctx).toEqual({});
  });
});
