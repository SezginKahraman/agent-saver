import type { RawTranscript } from '@agent-saver/core';

/**
 * Yields each non-empty line's parsed object, silently skipping lines that
 * fail to JSON.parse. Use when you only care about valid records (stats,
 * extraction).
 */
export function* parseLines(
  transcript: RawTranscript,
): Generator<Record<string, unknown>> {
  for (const line of transcript.raw.split('\n')) {
    if (!line) continue;
    try {
      yield JSON.parse(line) as Record<string, unknown>;
    } catch {
      // skip malformed
    }
  }
}

/**
 * Yields each non-empty line as both its raw text and parsed form
 * (or `null` if it failed to parse). Use when malformed bytes must
 * be preserved verbatim — e.g. round-trip transformations.
 */
export function* iterLines(
  transcript: RawTranscript,
): Generator<{ line: string; parsed: Record<string, unknown> | null }> {
  for (const line of transcript.raw.split('\n')) {
    if (!line) continue;
    try {
      yield { line, parsed: JSON.parse(line) as Record<string, unknown> };
    } catch {
      yield { line, parsed: null };
    }
  }
}
