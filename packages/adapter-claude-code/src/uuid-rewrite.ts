import type { RawTranscript } from '@agent-saver/core';

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
  const lines = transcript.raw.split('\n').filter(Boolean);
  const out: string[] = [];

  lines.forEach((line, idx) => {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      out.push(line);
      return;
    }
    obj.sessionId = params.newSessionId;
    if (idx === 0) {
      obj.parentSessionId = params.parentSessionId;
    }
    patchNullOriginalFile(obj);
    out.push(JSON.stringify(obj));
  });

  return { raw: out.join('\n') + '\n' };
}
