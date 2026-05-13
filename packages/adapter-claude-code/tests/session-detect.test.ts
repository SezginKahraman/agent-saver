import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectActiveSession } from '../src/session-detect.js';
import { sanitizePath } from '../src/paths.js';

describe('detectActiveSession', () => {
  let fakeHome: string;
  // Use a path that does NOT exist so realpath throws and encodeCwd falls back
  // to the raw input — keeps the test deterministic across platforms (/tmp vs
  // /private/tmp on macOS).
  const cwd = '/this-path/does/not/exist/proj';

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), 'home-'));
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
  });

  it('returns the UUID of the most recently modified JSONL', async () => {
    const sessionsDir = join(fakeHome, '.claude', 'projects', sanitizePath(cwd));
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, 'old.jsonl'), 'a');
    await writeFile(join(sessionsDir, 'new.jsonl'), 'b');
    const past = new Date(Date.now() - 60_000);
    await utimes(join(sessionsDir, 'old.jsonl'), past, past);

    const got = await detectActiveSession(cwd, { home: fakeHome });
    expect(got).toBe('new');
  });

  it('returns null when no JSONLs exist', async () => {
    const got = await detectActiveSession(cwd, { home: fakeHome });
    expect(got).toBeNull();
  });

  it('respects recencyMs — returns null when newest file is older than the window', async () => {
    const sessionsDir = join(fakeHome, '.claude', 'projects', sanitizePath(cwd));
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, 'stale.jsonl'), 'a');
    const past = new Date(Date.now() - 600_000); // 10 min ago
    await utimes(join(sessionsDir, 'stale.jsonl'), past, past);

    const got = await detectActiveSession(cwd, { home: fakeHome, recencyMs: 60_000 });
    expect(got).toBeNull();
  });
});
