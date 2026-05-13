import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { encodeCwd, MAX_SANITIZED_LENGTH } from './paths.js';

export interface DetectOpts {
  home?: string;
  /** Reject results older than this (ms). Default: no cap. */
  recencyMs?: number;
  /** Inject clock for tests. */
  now?: () => number;
}

const PROJECTS_DIR = '.claude/projects';

async function listJsonl(dir: string): Promise<Array<{ name: string; mtimeMs: number }>> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: Array<{ name: string; mtimeMs: number }> = [];
  for (const e of entries) {
    if (!e.endsWith('.jsonl')) continue;
    try {
      const s = await stat(join(dir, e));
      out.push({ name: e, mtimeMs: s.mtimeMs });
    } catch {
      // skip races/permissions issues
    }
  }
  return out;
}

export async function detectActiveSession(
  cwd: string,
  opts: DetectOpts = {},
): Promise<string | null> {
  const home = opts.home ?? homedir();
  const projectsRoot = join(home, PROJECTS_DIR);
  const encoded = encodeCwd(cwd);
  let candidates = await listJsonl(join(projectsRoot, encoded));

  // Prefix-scan fallback for paths > MAX_SANITIZED_LENGTH: CC running under Bun
  // may have hashed differently than agent-saver running under Node. Any sibling
  // dir starting with the same truncated prefix is a viable match.
  if (candidates.length === 0 && encoded.length > MAX_SANITIZED_LENGTH) {
    const prefix = encoded.slice(0, MAX_SANITIZED_LENGTH);
    let siblings: string[];
    try {
      siblings = await readdir(projectsRoot);
    } catch {
      siblings = [];
    }
    for (const sib of siblings) {
      if (sib.startsWith(prefix)) {
        candidates.push(...(await listJsonl(join(projectsRoot, sib))));
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const newest = candidates[0]!;

  if (opts.recencyMs !== undefined) {
    const now = (opts.now ?? Date.now)();
    if (now - newest.mtimeMs > opts.recencyMs) return null;
  }

  return newest.name.replace(/\.jsonl$/, '');
}
