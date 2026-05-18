// packages/core/src/types.ts

export type Scope = 'project' | 'global';

export type LoadScopePreference = Scope | 'auto';

export interface RawTranscript {
  /** Verbatim file contents as bytes/string. Format is owned by the adapter. */
  readonly raw: string;
}

export interface Metadata {
  readonly name: string;
  readonly description?: string;
  readonly created_at: string;
  readonly agent_saver_version: string;

  readonly source_tool: string;
  readonly source_session_id: string;
  readonly source_cwd: string;

  readonly git_branch?: string;
  readonly git_sha?: string;
  readonly git_dirty?: boolean;

  readonly message_count: number;
  readonly estimated_tokens: number;
  readonly files_touched: readonly string[];
}

export interface AgentRef {
  readonly name: string;
  readonly scope: Scope;
  /** Absolute path to the agent directory. */
  readonly path: string;
  readonly metadata: Metadata;
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
