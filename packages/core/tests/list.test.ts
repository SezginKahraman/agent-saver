// packages/core/tests/list.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { list } from '../src/operations/list.js';
import { ProjectStore } from '../src/store/project-store.js';
import { GlobalStore } from '../src/store/global-store.js';
import type { Metadata } from '../src/types.js';
import { VERSION } from '../src/version.js';

function meta(name: string, cwd: string): Metadata {
  return {
    name,
    created_at: '2026-05-13T00:00:00Z',
    agent_saver_version: VERSION,
    source_tool: 'mock',
    source_session_id: 'sid',
    source_cwd: cwd,
    message_count: 0,
    estimated_tokens: 0,
    files_touched: [],
  };
}

const origHome = process.env.HOME;

describe('list', () => {
  let repo: string;
  let fakeHome: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'list-repo-'));
    fakeHome = await mkdtemp(join(tmpdir(), 'list-home-'));
    process.env.HOME = fakeHome;
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
    await rm(fakeHome, { recursive: true, force: true });
    if (origHome !== undefined) process.env.HOME = origHome;
  });

  it('returns project + global combined when scope=auto', async () => {
    await new ProjectStore(repo).save('a', { raw: '' }, meta('a', repo));
    await new GlobalStore().save('b', { raw: '' }, meta('b', repo));

    const all = await list({ cwd: repo, scope: 'auto' });
    const names = all.map((r) => `${r.scope}/${r.name}`).sort();
    expect(names).toEqual(['global/b', 'project/a']);
  });

  it('respects scope=project', async () => {
    await new ProjectStore(repo).save('a', { raw: '' }, meta('a', repo));
    await new GlobalStore().save('b', { raw: '' }, meta('b', repo));

    const out = await list({ cwd: repo, scope: 'project' });
    expect(out.map((r) => r.name)).toEqual(['a']);
  });
});
