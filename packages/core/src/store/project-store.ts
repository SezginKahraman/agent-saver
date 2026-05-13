import { join } from 'node:path';
import { FsStore } from './fs-store.js';

export class ProjectStore extends FsStore {
  constructor(cwd: string) {
    super('project', join(cwd, '.claude', 'agents'));
  }
}
