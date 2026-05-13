import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteUuids } from '../src/uuid-rewrite.js';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample-session.jsonl');

describe('rewriteUuids', () => {
  it('rewrites sessionId on every message and records parent on first', () => {
    const raw = readFileSync(fixturePath, 'utf8');
    const out = rewriteUuids(
      { raw },
      { newSessionId: 'new-session-uuid', parentSessionId: 'orig-session-uuid' },
    );

    const lines = out.raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.length).toBeGreaterThan(0);
    for (const m of lines) {
      expect(m.sessionId).toBe('new-session-uuid');
    }
    expect(lines[0]!.parentSessionId).toBe('orig-session-uuid');
  });

  it('preserves parentUuid chain unchanged', () => {
    const raw = readFileSync(fixturePath, 'utf8');
    const orig = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
    const out = rewriteUuids(
      { raw },
      { newSessionId: 'new', parentSessionId: 'old' },
    );
    const after = out.raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
    for (let i = 0; i < orig.length; i++) {
      expect(after[i]!.parentUuid).toEqual(orig[i]!.parentUuid);
    }
  });

  it('emits trailing newline', () => {
    const raw = readFileSync(fixturePath, 'utf8');
    const out = rewriteUuids({ raw }, { newSessionId: 'n', parentSessionId: 'o' });
    expect(out.raw.endsWith('\n')).toBe(true);
  });
});
