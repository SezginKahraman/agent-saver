import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTranscript, writeTranscript } from '../src/transcript-io.js';
import { sanitizePath } from '../src/paths.js';

describe('transcript I/O', () => {
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), 'home-'));
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
  });

  it('reads a JSONL transcript by session id', async () => {
    const cwd = '/this-does-not-exist/proj-r';
    const dir = join(fakeHome, '.claude', 'projects', sanitizePath(cwd));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'abc-123.jsonl'), '{"a":1}\n{"a":2}\n');

    const t = await readTranscript('abc-123', cwd, { home: fakeHome });
    expect(t.raw).toBe('{"a":1}\n{"a":2}\n');
  });

  it('writes a transcript to the encoded project sessions dir', async () => {
    const cwd = '/this-does-not-exist/proj-w';
    const sessionId = 'new-uuid-1';

    await writeTranscript(
      { raw: '{"x":1}\n' },
      { newSessionId: sessionId, parentSessionId: 'old', targetCwd: cwd },
      { home: fakeHome },
    );

    const written = await readFile(
      join(fakeHome, '.claude', 'projects', sanitizePath(cwd), `${sessionId}.jsonl`),
      'utf8',
    );
    expect(written).toBe('{"x":1}\n');
  });
});
