import type { RawTranscript } from '@agent-saver/core';
import { iterLines } from './jsonl.js';

export interface RewriteParams {
  newSessionId: string;
  parentSessionId: string;
}

/**
 * Patches `toolUseResult.originalFile: null` to empty string. CC's interactive
 * renderer calls `originalFile.split('\n')` to draw the file-diff UI; on null
 * this crashes with `Cannot read properties of null (reading 'split')`. Write
 * tool calls (creating new files) produce null here legitimately — there is no
 * "original" yet. Replacing with `""` renders an empty diff, which is harmless.
 */
function patchNullOriginalFile(obj: Record<string, unknown>): void {
  const r = obj.toolUseResult;
  if (
    r &&
    typeof r === 'object' &&
    !Array.isArray(r) &&
    (r as Record<string, unknown>).originalFile === null
  ) {
    (r as Record<string, unknown>).originalFile = '';
  }
}

export function rewriteUuids(transcript: RawTranscript, params: RewriteParams): RawTranscript {
  const out: string[] = [];
  let isFirst = true;

  for (const { line, parsed } of iterLines(transcript)) {
    if (parsed === null) {
      out.push(line);
      continue;
    }
    parsed.sessionId = params.newSessionId;
    if (isFirst) {
      parsed.parentSessionId = params.parentSessionId;
      isFirst = false;
    }
    patchNullOriginalFile(parsed);
    out.push(JSON.stringify(parsed));
  }

  return { raw: out.join('\n') + '\n' };
}
