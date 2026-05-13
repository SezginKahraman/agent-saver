import { describe, it, expect } from 'vitest';
import { buildResumeCommand } from '../src/resume-cmd.js';

describe('buildResumeCommand', () => {
  it('omits cd when sourceCwd matches currentCwd', () => {
    expect(buildResumeCommand('uuid-1', '/proj', '/proj')).toBe('claude --resume uuid-1');
  });

  it('prepends cd when cwds differ', () => {
    expect(buildResumeCommand('uuid-1', '/proj', '/elsewhere')).toBe(
      `cd '/proj' && claude --resume uuid-1`,
    );
  });

  it('single-quotes paths with spaces', () => {
    expect(buildResumeCommand('uuid', '/path with space', '/x')).toBe(
      `cd '/path with space' && claude --resume uuid`,
    );
  });

  it('escapes single quotes inside path', () => {
    // Input path: /it's
    // Shell-quoted: '/it'\''s'  (close quote, escaped quote, reopen quote)
    expect(buildResumeCommand('uuid', `/it's`, '/x')).toBe(
      `cd '/it'\\''s' && claude --resume uuid`,
    );
  });
});
