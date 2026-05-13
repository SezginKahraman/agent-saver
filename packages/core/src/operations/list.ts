// packages/core/src/operations/list.ts
import type { AgentRef, ListOpts } from '../types.js';
import { ProjectStore } from '../store/project-store.js';
import { GlobalStore } from '../store/global-store.js';

export async function list(opts: ListOpts = {}): Promise<AgentRef[]> {
  const cwd = opts.cwd ?? process.cwd();
  const scope = opts.scope ?? 'auto';

  const projectAgents = scope === 'global' ? [] : await new ProjectStore(cwd).list();
  const globalAgents = scope === 'project' ? [] : await new GlobalStore().list();

  return [...projectAgents, ...globalAgents];
}
