import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RawTranscript } from '@agent-saver/core';
import { projectSessionsDir } from './paths.js';

export interface IoOpts {
  home?: string;
}

export async function readTranscript(
  sessionId: string,
  cwd: string,
  opts: IoOpts = {},
): Promise<RawTranscript> {
  const home = opts.home ?? homedir();
  const file = join(projectSessionsDir(cwd, home), `${sessionId}.jsonl`);
  const raw = await readFile(file, 'utf8');
  return { raw };
}

export interface WriteParams {
  newSessionId: string;
  parentSessionId: string;
  targetCwd: string;
}

export async function writeTranscript(
  transcript: RawTranscript,
  params: WriteParams,
  opts: IoOpts = {},
): Promise<void> {
  const home = opts.home ?? homedir();
  const dir = projectSessionsDir(params.targetCwd, home);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${params.newSessionId}.jsonl`);
  await writeFile(file, transcript.raw, 'utf8');
}
