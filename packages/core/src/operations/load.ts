// packages/core/src/operations/load.ts
import { randomUUID } from 'node:crypto';
import type { ToolAdapter } from '../adapter.js';
import type { LoadOpts, LoadResult } from '../types.js';
import type { SavedAgent } from '../store/index.js';
import { ProjectStore } from '../store/project-store.js';
import { GlobalStore } from '../store/global-store.js';

export async function load(
  adapter: ToolAdapter,
  name: string,
  opts: LoadOpts = {},
): Promise<LoadResult> {
  const cwd = opts.cwd ?? process.cwd();
  const scopePref = opts.scope ?? 'auto';

  const projectStore = new ProjectStore(cwd);
  const globalStore = new GlobalStore();

  let found: SavedAgent | null = null;
  if (scopePref !== 'global' && (await projectStore.has(name))) {
    found = await projectStore.read(name);
  } else if (scopePref !== 'project' && (await globalStore.has(name))) {
    found = await globalStore.read(name);
  }
  if (!found) {
    throw new Error(`agent "${name}" not found in scope ${scopePref}`);
  }

  const newSessionId = randomUUID();
  await adapter.writeTranscript(found.transcript, {
    newSessionId,
    parentSessionId: found.metadata.source_session_id,
    targetCwd: found.metadata.source_cwd,
  });

  const resumeCommand = adapter.resumeCommand(newSessionId, found.metadata.source_cwd, cwd);
  return { agent: found.ref, newSessionId, resumeCommand };
}
