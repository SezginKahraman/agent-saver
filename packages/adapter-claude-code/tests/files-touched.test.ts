import { describe, it, expect } from 'vitest';
import { extractFilesTouched } from '../src/files-touched.js';

// Synthetic transcript with tool_use entries
const sample =
  JSON.stringify({
    type: 'assistant',
    content: [
      { type: 'tool_use', name: 'Read', input: { file_path: '/proj/src/a.ts' } },
      { type: 'tool_use', name: 'Edit', input: { file_path: '/proj/src/b.ts' } },
      { type: 'tool_use', name: 'Write', input: { file_path: '/proj/src/a.ts' } },
      { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
    ],
  }) +
  '\n' +
  JSON.stringify({
    type: 'assistant',
    content: [
      { type: 'tool_use', name: 'Read', input: { file_path: '/proj/src/c.ts' } },
    ],
  }) +
  '\n';

describe('extractFilesTouched', () => {
  it('collects file_path from Read/Edit/Write tool_use entries, deduped', () => {
    const out = extractFilesTouched({ raw: sample });
    expect(out.sort()).toEqual(['/proj/src/a.ts', '/proj/src/b.ts', '/proj/src/c.ts']);
  });

  it('returns empty for empty transcript', () => {
    expect(extractFilesTouched({ raw: '' })).toEqual([]);
  });
});
