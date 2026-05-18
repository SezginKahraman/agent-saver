import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(exec);

export interface GitContext {
  readonly git_branch?: string;
  readonly git_sha?: string;
  readonly git_dirty?: boolean;
}

async function tryGit(args: string, cwd: string): Promise<string | null> {
  try {
    const { stdout } = await pexec(`git ${args}`, { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function collectGitContext(cwd: string): Promise<GitContext> {
  const inside = await tryGit('rev-parse --is-inside-work-tree', cwd);
  if (inside !== 'true') return {};

  const [sha, branch, status] = await Promise.all([
    tryGit('rev-parse HEAD', cwd),
    tryGit('branch --show-current', cwd),
    tryGit('status --porcelain', cwd),
  ]);

  return {
    ...(sha ? { git_sha: sha } : {}),
    ...(branch ? { git_branch: branch } : {}),
    ...(status !== null ? { git_dirty: status.length > 0 } : {}),
  };
}
