import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(exec);

export interface GitContext {
  git_branch?: string;
  git_sha?: string;
  git_dirty?: boolean;
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

  const ctx: GitContext = {};
  if (sha) ctx.git_sha = sha;
  if (branch) ctx.git_branch = branch;
  if (status !== null) ctx.git_dirty = status.length > 0;
  return ctx;
}
