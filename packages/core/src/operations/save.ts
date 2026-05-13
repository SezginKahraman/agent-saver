// packages/core/src/operations/save.ts
import type { ToolAdapter } from '../adapter.js';
import type { AgentRef, Metadata, SaveOpts } from '../types.js';
import { collectGitContext } from '../git.js';
import { ProjectStore } from '../store/project-store.js';
import { GlobalStore } from '../store/global-store.js';
import { VERSION } from '../version.js';

export async function save(
  adapter: ToolAdapter,
  name: string,
  opts: SaveOpts = {},
): Promise<AgentRef> {
  const cwd = opts.cwd ?? process.cwd();
  const sessionId = opts.sessionId ?? (await adapter.detectActiveSession(cwd));
  if (!sessionId) {
    throw new Error('no active session detected — provide opts.sessionId to override detection');
  }

  const transcript = await adapter.readTranscript(sessionId, cwd);
  const git = await collectGitContext(cwd);

  const metadata: Metadata = {
    name,
    ...(opts.description !== undefined && { description: opts.description }),
    created_at: new Date().toISOString(),
    agent_saver_version: VERSION,
    source_tool: adapter.toolName,
    source_session_id: sessionId,
    source_cwd: cwd,
    ...git,
    message_count: adapter.countMessages(transcript),
    estimated_tokens: adapter.estimateTokens(transcript),
    files_touched: adapter.extractFilesTouched(transcript),
  };

  const store = opts.scope === 'global' ? new GlobalStore() : new ProjectStore(cwd);
  return store.save(name, transcript, metadata);
}
