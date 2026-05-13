// packages/core/src/types.ts

export type Scope = 'project' | 'global';

export type LoadScopePreference = Scope | 'auto';

export interface RawTranscript {
  /** Verbatim file contents as bytes/string. Format is owned by the adapter. */
  readonly raw: string;
}

export interface Metadata {
  name: string;
  description?: string;
  created_at: string;
  agent_saver_version: string;

  source_tool: string;
  source_session_id: string;
  source_cwd: string;

  git_branch?: string;
  git_sha?: string;
  git_dirty?: boolean;

  message_count: number;
  estimated_tokens: number;
  files_touched: string[];
}

export interface AgentRef {
  name: string;
  scope: Scope;
  /** Absolute path to the agent directory. */
  path: string;
  metadata: Metadata;
}

export interface SaveOpts {
  description?: string;
  scope?: Scope;
  /** Override the cwd used to locate the active session. */
  cwd?: string;
  /** Override session detection entirely. */
  sessionId?: string;
}

export interface LoadOpts {
  /** 'auto' tries project then global. */
  scope?: LoadScopePreference;
  cwd?: string;
}

export interface LoadResult {
  agent: AgentRef;
  newSessionId: string;
  /** Ready-to-paste shell command. May include a `cd` prefix. */
  resumeCommand: string;
}

export interface ListOpts {
  scope?: LoadScopePreference;
  cwd?: string;
}
