import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentRef, Metadata, RawTranscript, Scope } from '../types.js';
import type { AgentStore, SavedAgent } from './index.js';

export class FsStore implements AgentStore {
  constructor(public readonly scope: Scope, public readonly baseDir: string) {}

  private agentDir(name: string): string {
    return join(this.baseDir, name);
  }

  async has(name: string): Promise<boolean> {
    try {
      await stat(join(this.agentDir(name), 'metadata.json'));
      return true;
    } catch {
      return false;
    }
  }

  async save(name: string, transcript: RawTranscript, metadata: Metadata): Promise<AgentRef> {
    const dir = this.agentDir(name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'transcript.jsonl'), transcript.raw, 'utf8');
    await writeFile(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');
    return { name, scope: this.scope, path: dir, metadata };
  }

  async read(name: string): Promise<SavedAgent> {
    const dir = this.agentDir(name);
    const [raw, metaText] = await Promise.all([
      readFile(join(dir, 'transcript.jsonl'), 'utf8'),
      readFile(join(dir, 'metadata.json'), 'utf8'),
    ]);
    const metadata = JSON.parse(metaText) as Metadata;
    return {
      transcript: { raw },
      metadata,
      ref: { name, scope: this.scope, path: dir, metadata },
    };
  }

  async list(): Promise<AgentRef[]> {
    let entries: string[];
    try {
      entries = await readdir(this.baseDir);
    } catch {
      return [];
    }
    const refs: AgentRef[] = [];
    for (const name of entries) {
      try {
        const dir = this.agentDir(name);
        const metaText = await readFile(join(dir, 'metadata.json'), 'utf8');
        const metadata = JSON.parse(metaText) as Metadata;
        refs.push({ name, scope: this.scope, path: dir, metadata });
      } catch {
        // skip non-agent dirs
      }
    }
    return refs;
  }
}
