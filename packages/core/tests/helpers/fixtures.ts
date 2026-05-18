import type { Metadata } from '../../src/types.js';
import { VERSION } from '../../src/version.js';

/**
 * Builds a valid Metadata object with sensible defaults. Pass overrides to
 * customize any subset of fields.
 *
 *   makeMetadata()                          // jacob, /tmp/proj
 *   makeMetadata({ name: 'sarah' })         // sarah, /tmp/proj
 *   makeMetadata({ source_cwd: '/foo' })    // jacob, /foo
 */
export function makeMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    name: 'jacob',
    created_at: '2026-05-13T00:00:00Z',
    agent_saver_version: VERSION,
    source_tool: 'mock',
    source_session_id: 'orig-session',
    source_cwd: '/tmp/proj',
    message_count: 0,
    estimated_tokens: 0,
    files_touched: [],
    ...overrides,
  };
}
