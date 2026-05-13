import { homedir } from 'node:os';
import { join } from 'node:path';
import { FsStore } from './fs-store.js';

function resolveHome(): string {
  return process.env.HOME ?? homedir();
}

export class GlobalStore extends FsStore {
  constructor() {
    super('global', join(resolveHome(), '.claude', 'agents'));
  }
}
