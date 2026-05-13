import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const MAX_SANITIZED_LENGTH = 200;

/** djb2 hash to match CC's `simpleHash` path-suffix algorithm (Node case). */
function djb2(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/** Pure: replaces non-alphanumeric chars with '-', truncates + hashes if too long. */
export function sanitizePath(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized;
  }
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${djb2(name)}`;
}

/** Mirrors CC: realpath → NFC normalize → sanitize. Falls back to raw input if realpath throws. */
export function encodeCwd(cwd: string): string {
  let resolved: string;
  try {
    resolved = realpathSync(cwd).normalize('NFC');
  } catch {
    resolved = cwd.normalize('NFC');
  }
  return sanitizePath(resolved);
}

export function projectSessionsDir(cwd: string, home: string = homedir()): string {
  return join(home, '.claude', 'projects', encodeCwd(cwd));
}
