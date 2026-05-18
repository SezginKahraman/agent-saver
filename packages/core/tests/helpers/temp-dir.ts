import { afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Vitest fixture: creates a fresh temp dir in `beforeEach`, removes it in
 * `afterEach`. Returns a getter so the path can be read inside `it()` bodies.
 *
 *   const getDir = useTempDir('my-test-');
 *   it('does the thing', () => { const dir = getDir(); ... });
 *
 * Optional `setup` runs in the SAME `beforeEach` after the dir is created —
 * use it when a test needs additional initialization (e.g., `git init`) and
 * you'd otherwise have to write a second `beforeEach` whose hook ordering
 * relative to this one is implementation-defined.
 *
 *   const getRepo = useTempDir('git-', initGitRepo);
 */
export function useTempDir(prefix: string, setup?: (dir: string) => Promise<void>): () => string {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), prefix));
    if (setup) await setup(dir);
  });
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  return () => dir;
}
