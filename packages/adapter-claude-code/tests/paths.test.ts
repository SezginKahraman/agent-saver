import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizePath, encodeCwd, projectSessionsDir, MAX_SANITIZED_LENGTH } from '../src/paths.js';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const d of tempDirs.splice(0)) {
    await rm(d, { recursive: true, force: true });
  }
});

describe('sanitizePath (pure)', () => {
  it('replaces every non-alphanumeric character with a dash', () => {
    expect(sanitizePath('/Users/x/repos/y')).toBe('-Users-x-repos-y');
  });

  it('handles dots, colons, and other punctuation', () => {
    expect(sanitizePath('/Users/x.y/sub:dir')).toBe('-Users-x-y-sub-dir');
  });

  it('truncates paths longer than MAX_SANITIZED_LENGTH and appends a hash', () => {
    const long = '/' + 'a'.repeat(MAX_SANITIZED_LENGTH + 50);
    const out = sanitizePath(long);
    expect(out.length).toBeGreaterThan(MAX_SANITIZED_LENGTH);
    // First MAX_SANITIZED_LENGTH chars come from the sanitized prefix:
    expect(out.startsWith('-' + 'a'.repeat(MAX_SANITIZED_LENGTH - 1))).toBe(true);
    expect(out).toMatch(/-[0-9a-z]+$/);
  });

  it('is deterministic for the same input', () => {
    const long = '/' + 'a'.repeat(MAX_SANITIZED_LENGTH + 50);
    expect(sanitizePath(long)).toBe(sanitizePath(long));
  });
});

describe('encodeCwd', () => {
  it('applies realpath before sanitizing (resolves symlinks)', async () => {
    const realDir = await mkdtemp(join(tmpdir(), 'paths-real-'));
    const linkDir = await mkdtemp(join(tmpdir(), 'paths-link-'));
    const link = join(linkDir, 'link');
    await symlink(realDir, link);
    // Push linkDir first so it is cleaned up before realDir
    // (symlink inside linkDir must be gone before linkDir is removed)
    tempDirs.push(linkDir, realDir);
    // encodeCwd applies realpath to the symlink target; realDir itself may also
    // be a symlink (e.g. macOS /var → /private/var), so resolve it too.
    const resolvedRealDir = realpathSync(realDir).normalize('NFC');
    expect(encodeCwd(link)).toBe(sanitizePath(resolvedRealDir));
  });

  it('falls back to raw path when realpath fails', () => {
    // Non-existent path — realpath will throw; encode the literal input.
    const nonexistent = '/this/path/does/not/exist/xyz';
    expect(encodeCwd(nonexistent)).toBe(sanitizePath(nonexistent));
  });
});

describe('projectSessionsDir', () => {
  it('joins home/.claude/projects with the encoded cwd', () => {
    const result = projectSessionsDir('/this/path/does/not/exist', '/home/me');
    expect(result).toBe(`/home/me/.claude/projects/${sanitizePath('/this/path/does/not/exist')}`);
  });
});
