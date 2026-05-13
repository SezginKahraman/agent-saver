// packages/adapter-claude-code/tests/adapter.integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeCodeAdapter } from '../src/adapter.js';
import { sanitizePath } from '../src/paths.js';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample-session.jsonl');

describe('ClaudeCodeAdapter (integration)', () => {
  let fakeHome: string;
  const cwd = '/this-does-not-exist/agent-saver-int';
  const origHome = process.env.HOME;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), 'home-'));
    process.env.HOME = fakeHome;
    delete process.env.CLAUDE_SESSION_ID;
    const sessionsDir = join(fakeHome, '.claude', 'projects', sanitizePath(cwd));
    await mkdir(sessionsDir, { recursive: true });
    await copyFile(fixturePath, join(sessionsDir, 'orig-session.jsonl'));
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
    if (origHome !== undefined) process.env.HOME = origHome;
    else delete process.env.HOME;
  });

  it('detects, reads, rewrites, and writes a transcript', async () => {
    const adapter = new ClaudeCodeAdapter({ home: fakeHome });
    const sessionId = await adapter.detectActiveSession(cwd);
    expect(sessionId).toBe('orig-session');

    const transcript = await adapter.readTranscript(sessionId!, cwd);
    expect(transcript.raw.length).toBeGreaterThan(0);

    const newId = '00000000-0000-0000-0000-000000000000';
    await adapter.writeTranscript(transcript, {
      newSessionId: newId,
      parentSessionId: sessionId!,
      targetCwd: cwd,
    });

    const writtenPath = join(fakeHome, '.claude', 'projects', sanitizePath(cwd), `${newId}.jsonl`);
    const written = await readFile(writtenPath, 'utf8');
    const firstLine = JSON.parse(written.split('\n')[0]!) as Record<string, unknown>;
    expect(firstLine.sessionId).toBe(newId);
    expect(firstLine.parentSessionId).toBe('orig-session');
  });
});
