import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { list } from '../src/operations/list.js';
import { ProjectStore } from '../src/store/project-store.js';
import { GlobalStore } from '../src/store/global-store.js';
import { useTempDir } from './helpers/temp-dir.js';
import { makeMetadata } from './helpers/fixtures.js';

const origHome = process.env.HOME;

describe('list', () => {
  const getRepo = useTempDir('list-repo-');
  const getFakeHome = useTempDir('list-home-');

  beforeEach(() => {
    process.env.HOME = getFakeHome();
  });

  afterEach(() => {
    if (origHome !== undefined) process.env.HOME = origHome;
    else delete process.env.HOME;
  });

  it('returns project + global combined when scope=auto', async () => {
    const repo = getRepo();
    await new ProjectStore(repo).save('a', { raw: '' }, makeMetadata({ name: 'a', source_cwd: repo }));
    await new GlobalStore().save('b', { raw: '' }, makeMetadata({ name: 'b', source_cwd: repo }));

    const all = await list({ cwd: repo, scope: 'auto' });
    const names = all.map((r) => `${r.scope}/${r.name}`).sort();
    expect(names).toEqual(['global/b', 'project/a']);
  });

  it('respects scope=project', async () => {
    const repo = getRepo();
    await new ProjectStore(repo).save('a', { raw: '' }, makeMetadata({ name: 'a', source_cwd: repo }));
    await new GlobalStore().save('b', { raw: '' }, makeMetadata({ name: 'b', source_cwd: repo }));

    const out = await list({ cwd: repo, scope: 'project' });
    expect(out.map((r) => r.name)).toEqual(['a']);
  });

  it('respects scope=global', async () => {
    const repo = getRepo();
    await new ProjectStore(repo).save('a', { raw: '' }, makeMetadata({ name: 'a', source_cwd: repo }));
    await new GlobalStore().save('b', { raw: '' }, makeMetadata({ name: 'b', source_cwd: repo }));

    const out = await list({ cwd: repo, scope: 'global' });
    expect(out.map((r) => `${r.scope}/${r.name}`)).toEqual(['global/b']);
  });
});
