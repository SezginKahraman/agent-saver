import { homedir } from 'node:os';
import { join } from 'node:path';
import { FsStore } from './fs-store.js';

/** Same fallback chain as the CC adapter's `resolveHome`. Kept local because
 *  `@agent-saver/core` cannot depend on the adapter package. */
function resolveHome(home?: string): string {
  return home ?? process.env.HOME ?? homedir();
}

export interface GlobalStoreOpts {
  /** Override the home directory (useful for testing). */
  home?: string;
}

export class GlobalStore extends FsStore {
  constructor(opts: GlobalStoreOpts = {}) {
    super('global', join(resolveHome(opts.home), '.claude', 'agents'));
  }
}
