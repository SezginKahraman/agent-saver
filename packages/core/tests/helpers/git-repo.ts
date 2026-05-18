import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Initializes a fresh git repo at `dir` with a single `a.txt` commit on
 * branch `main`. Used by tests that need `collectGitContext()` to find a
 * valid repo.
 */
export async function initGitRepo(dir: string): Promise<void> {
  execSync('git init -b main', { cwd: dir });
  execSync('git config user.email t@t.t && git config user.name t', {
    cwd: dir,
    shell: '/bin/bash',
  });
  await writeFile(join(dir, 'a.txt'), 'hi');
  execSync('git add . && git commit -m init', { cwd: dir, shell: '/bin/bash' });
}
