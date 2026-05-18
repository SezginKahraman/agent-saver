import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RawTranscript, WriteOpts } from '@agent-saver/core';
import { projectSessionsDir, resolveHome } from './paths.js';

export interface IoOpts {
  home?: string;
}

export async function readTranscript(
  sessionId: string,
  cwd: string,
  opts: IoOpts = {},
): Promise<RawTranscript> {
  const home = resolveHome(opts);
  const file = join(projectSessionsDir(cwd, home), `${sessionId}.jsonl`);
  const raw = await readFile(file, 'utf8');
  return { raw };
}

export async function writeTranscript(
  transcript: RawTranscript,
  params: WriteOpts,
  opts: IoOpts = {},
): Promise<void> {
  const home = resolveHome(opts);
  const dir = projectSessionsDir(params.targetCwd, home);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${params.newSessionId}.jsonl`);
  await writeFile(file, transcript.raw, 'utf8');
}
