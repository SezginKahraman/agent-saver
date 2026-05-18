import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { load } from '../src/operations/load.js';
import { ProjectStore } from '../src/store/project-store.js';
import { GlobalStore } from '../src/store/global-store.js';
import { useTempDir } from './helpers/temp-dir.js';
import { makeMetadata } from './helpers/fixtures.js';
import { MockAdapter } from './helpers/mock-adapter.js';

const origHome = process.env.HOME;

describe('load', () => {
  const getRepo = useTempDir('load-test-');
  const getFakeHome = useTempDir('load-home-');

  beforeEach(() => {
    process.env.HOME = getFakeHome();
  });

  afterEach(() => {
    if (origHome !== undefined) process.env.HOME = origHome;
    else delete process.env.HOME;
  });

  it('loads project-scoped agent and returns resume command for same cwd', async () => {
    const repo = getRepo();
    const store = new ProjectStore(repo);
    await store.save(
      'jacob',
      { raw: 'x' },
      makeMetadata({ name: 'jacob', source_cwd: repo, message_count: 5, estimated_tokens: 100 }),
    );

    const adapter = new MockAdapter();
    const result = await load(adapter, 'jacob', { cwd: repo });

    expect(result.agent.name).toBe('jacob');
    expect(result.newSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result.resumeCommand).toBe(`claude --resume ${result.newSessionId}`);
    expect(adapter.lastWriteOpts?.parentSessionId).toBe('orig-session');
    expect(adapter.lastWriteOpts?.targetCwd).toBe(repo);
  });

  it('loads global-scoped agent when scope is global', async () => {
    const repo = getRepo();
    await new GlobalStore().save(
      'sarah',
      { raw: 'y' },
      makeMetadata({ name: 'sarah', source_cwd: repo, source_session_id: 'global-sid' }),
    );

    const adapter = new MockAdapter();
    const result = await load(adapter, 'sarah', { cwd: repo, scope: 'global' });

    expect(result.agent.name).toBe('sarah');
    expect(result.agent.scope).toBe('global');
    expect(adapter.lastWriteOpts?.parentSessionId).toBe('global-sid');
  });

  it('falls through to global when scope is auto and project has no match', async () => {
    const repo = getRepo();
    // Only save to global — project store has nothing.
    await new GlobalStore().save(
      'lonely',
      { raw: 'z' },
      makeMetadata({ name: 'lonely', source_cwd: repo }),
    );

    const adapter = new MockAdapter();
    const result = await load(adapter, 'lonely', { cwd: repo, scope: 'auto' });

    expect(result.agent.scope).toBe('global');
    expect(result.agent.name).toBe('lonely');
  });

  it('does NOT fall back to global when scope is project', async () => {
    const repo = getRepo();
    await new GlobalStore().save(
      'global-only',
      { raw: 'g' },
      makeMetadata({ name: 'global-only', source_cwd: repo }),
    );

    const adapter = new MockAdapter();
    await expect(load(adapter, 'global-only', { cwd: repo, scope: 'project' })).rejects.toThrow(
      /not found/i,
    );
  });

  it('throws when name does not exist', async () => {
    const adapter = new MockAdapter();
    await expect(load(adapter, 'missing', { cwd: getRepo() })).rejects.toThrow(/not found/i);
  });
});
