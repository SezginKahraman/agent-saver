import { describe, it, expect } from 'vitest';
import { countMessages, estimateTokens } from '../src/transcript-stats.js';

const sample = [
  '{"type":"user","content":"hi"}',
  '{"type":"assistant","content":"hello"}',
  '{"type":"system","content":"noise"}',
  '{"type":"user","content":"bye"}',
].join('\n') + '\n';

describe('transcript stats', () => {
  it('countMessages counts user + assistant entries only', () => {
    expect(countMessages({ raw: sample })).toBe(3);
  });

  it('estimateTokens returns a positive integer for non-empty input', () => {
    const t = estimateTokens({ raw: sample });
    expect(t).toBeGreaterThan(0);
    expect(Number.isInteger(t)).toBe(true);
  });

  it('handles empty transcript', () => {
    expect(countMessages({ raw: '' })).toBe(0);
    expect(estimateTokens({ raw: '' })).toBe(0);
  });
});
