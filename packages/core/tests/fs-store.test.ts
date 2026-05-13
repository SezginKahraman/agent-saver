import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsStore } from '../src/store/fs-store.js';
import type { Metadata, RawTranscript } from '../src/types.js';

function makeFixture() {
  const transcript: RawTranscript = { raw: '{"hello":"world"}\n' };
  const metadata: Metadata = {
    name: 'jacob',
    description: 'auth expert',
    created_at: '2026-05-13T00:00:00Z',
    agent_saver_version: '0.1.0',
    source_tool: 'claude-code',
    source_session_id: 'abc-123',
    source_cwd: '/tmp/proj',
    message_count: 42,
    estimated_tokens: 1000,
    files_touched: ['src/auth.ts'],
  };
  return { transcript, metadata };
}

describe('FsStore', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'agent-saver-test-'));
  });

  it('saves and reads back an agent', async () => {
    const store = new FsStore('project', baseDir);
    const { transcript, metadata } = makeFixture();

    const ref = await store.save('jacob', transcript, metadata);

    expect(ref.name).toBe('jacob');
    expect(ref.scope).toBe('project');
    expect(ref.path).toBe(join(baseDir, 'jacob'));

    const round = await store.read('jacob');
    expect(round.transcript.raw).toBe(transcript.raw);
    expect(round.metadata.name).toBe('jacob');
    expect(round.metadata.files_touched).toEqual(['src/auth.ts']);
  });

  it('has() returns true after save, false otherwise', async () => {
    const store = new FsStore('global', baseDir);
    expect(await store.has('nobody')).toBe(false);

    const { transcript, metadata } = makeFixture();
    await store.save('sarah', transcript, metadata);

    expect(await store.has('sarah')).toBe(true);
    expect(await store.has('nobody')).toBe(false);
  });

  it('list() returns all saved agents', async () => {
    const store = new FsStore('project', baseDir);
    const { transcript, metadata } = makeFixture();

    await store.save('a', transcript, { ...metadata, name: 'a' });
    await store.save('b', transcript, { ...metadata, name: 'b' });

    const all = await store.list();
    const names = all.map((r) => r.name).sort();
    expect(names).toEqual(['a', 'b']);
  });
});
