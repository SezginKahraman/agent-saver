import type { RawTranscript } from '@agent-saver/core';

export interface RewriteParams {
  newSessionId: string;
  parentSessionId: string;
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
    out.push(JSON.stringify(obj));
  });

  return { raw: out.join('\n') + '\n' };
}
