import type { RawTranscript } from '@agent-saver/core';
import { parseLines } from './jsonl.js';

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit']);

interface ContentBlock {
  type?: string;
  name?: string;
  input?: { file_path?: string };
}

export function extractFilesTouched(transcript: RawTranscript): string[] {
  const seen = new Set<string>();
  for (const obj of parseLines(transcript)) {
    const content = obj.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as ContentBlock[]) {
      if (block?.type !== 'tool_use') continue;
      if (!block.name || !FILE_TOOLS.has(block.name)) continue;
      const fp = block.input?.file_path;
      if (typeof fp === 'string' && fp.length > 0) seen.add(fp);
    }
  }
  return [...seen];
}
