import type { RawTranscript } from '@agent-saver/core';
import { parseLines } from './jsonl.js';

const MESSAGE_TYPES = new Set(['user', 'assistant']);
const CHARS_PER_TOKEN = 4;

export function countMessages(transcript: RawTranscript): number {
  let n = 0;
  for (const obj of parseLines(transcript)) {
    if (typeof obj.type === 'string' && MESSAGE_TYPES.has(obj.type)) n++;
  }
  return n;
}

export function estimateTokens(transcript: RawTranscript): number {
  if (!transcript.raw) return 0;
  return Math.ceil(transcript.raw.length / CHARS_PER_TOKEN);
}
