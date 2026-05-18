import { describe, it, expect } from 'vitest';
import { load } from '../src/operations/load.js';
import { ProjectStore } from '../src/store/project-store.js';
import { useTempDir } from './helpers/temp-dir.js';
import { makeMetadata } from './helpers/fixtures.js';
import { MockAdapter } from './helpers/mock-adapter.js';

describe('load', () => {
  const getRepo = useTempDir('load-test-');

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

  it('throws when name does not exist', async () => {
    const adapter = new MockAdapter();
    await expect(load(adapter, 'missing', { cwd: getRepo() })).rejects.toThrow(/not found/i);
  });
});
