import { homedir } from 'node:os';
import { join } from 'node:path';
import { FsStore } from './fs-store.js';

export class GlobalStore extends FsStore {
  constructor() {
    super('global', join(homedir(), '.claude', 'agents'));
  }
}
