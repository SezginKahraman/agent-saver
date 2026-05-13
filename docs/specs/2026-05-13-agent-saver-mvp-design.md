# agent-saver MVP — Design Spec

**Date:** 2026-05-13
**Status:** Draft, awaiting user review
**Owner:** Sezgin Kahraman

---

## 1. Overview

`agent-saver` lets a user snapshot a live Claude Code session at any chosen moment, give it a name, and later reload it in a new terminal to continue exactly where the conversation left off. The primary motivation is the "golden moment" problem: an agent reaches a deep, accurate understanding of a project but is forced to compact context shortly after, losing that state.

The MVP targets a single tool (Claude Code) but is architected so additional tool adapters (Codex, Cursor) and additional UIs (TUI, VS Code extension, Electron) can be added later without touching core logic.

## 2. Use Cases

### In scope (MVP)

#### A. Compact-öncesi acil kayıt — "Save the golden moment"

- User is mid-conversation, agent has built deep context, compaction looms.
- User types `/save my-snapshot` and the entire current session is preserved.
- Hours or days later, user runs `/load my-snapshot` in a new terminal and resumes.
- Staleness risk: low (short lifetime).

### Architecture-compatible, deferred (v2)

#### B. Named domain specialists — "Jacob, the auth expert"

- A saved session represents accumulated expertise in some module.
- Two invocation modes: interactive reload, or subagent delegation (`ask_saved_agent` tool).
- Requires mitigations for stale file knowledge.

#### C. Cross-tool agent portability

- Same saved-agent registry reachable from Codex, Cursor, custom Playwright scripts.
- Requires additional tool adapters.

## 3. Non-Goals (Explicit)

The following are deliberately excluded from the MVP. They are deferred to keep scope tight, not because they are unimportant:

- Subagent delegation (`ask_saved_agent`) — v2 (depends on use case B).
- Stale-state diff banners — v2 (depends on use case B).
- Auto-checkpointing via hooks — v1.1.
- Transcript pruning (failed tool calls, redundant Reads) — v1.1.
- `delete_agent` MCP tool — v1.1 (manual `rm` is acceptable in MVP).
- Persona/summary generation — v2.
- Codex, Cursor, or other tool adapters — v2 onward.
- Visual UI (Electron / VS Code extension) — v2 onward.
- Sharing / publishing saved agents (marketplace) — out of scope entirely for the foreseeable future.

## 4. Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│  Consumers (independent surfaces, can be added over time)    │
│  ├── claude-agent-saver plugin     ✅ MVP                    │
│  │   ├── slash commands: /save /load /agents                 │
│  │   └── MCP server: save_agent / load_agent / list_agents   │
│  ├── @agent-saver/cli              ✅ MVP                    │
│  │   └── standalone `agent-saver` binary                     │
│  ├── (future) TUI app (Ink)         🔜                       │
│  ├── (future) VS Code / Cursor extension                     │
│  └── (future) Codex / Cursor plugins                         │
└─────────────────────────┬────────────────────────────────────┘
                          │ imports
┌─────────────────────────▼────────────────────────────────────┐
│  @agent-saver/core         (framework-free TypeScript)       │
│  - save(name, opts) → AgentRef                               │
│  - load(name, scope?) → { transcript, metadata, resumeCmd }  │
│  - list(scope?) → AgentRef[]                                 │
│  - ProjectStore + GlobalStore                                │
│  - ToolAdapter interface                                     │
└─────────────────────────┬────────────────────────────────────┘
                          │ uses
┌─────────────────────────▼────────────────────────────────────┐
│  Tool adapters (one per tool, native-format translators)     │
│  ├── @agent-saver/adapter-claude-code   ✅ MVP               │
│  ├── (future) @agent-saver/adapter-codex                     │
│  └── (future) @agent-saver/adapter-cursor                    │
└──────────────────────────────────────────────────────────────┘
```

**Key principle: adapter pattern on day 1.** Only one adapter ships in MVP, but the interface exists so future adapters can be added without touching `core`.

## 5. Components

### 5.1 `@agent-saver/core`

The framework-free TypeScript library. Has no Claude-Code-specific code; only orchestrates save/load/list operations against adapters and stores.

Exports:

- `save(name: string, opts?: SaveOpts): Promise<AgentRef>`
- `load(name: string, opts?: LoadOpts): Promise<LoadResult>`
- `list(scope?: 'project' | 'global' | 'all'): Promise<AgentRef[]>`
- `interface ToolAdapter { ... }`
- `interface AgentStore { ... }`
- `ProjectStore`, `GlobalStore` implementations

### 5.2 `@agent-saver/adapter-claude-code`

The Claude Code adapter. Implements the `ToolAdapter` interface.

Responsibilities:

- Detect the active CC session for a given `cwd`.
- Read CC's JSONL transcript from `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`.
- Write a transformed JSONL into the same dir for reload (new UUID, lineage tracking).
- Return the shell command to resume the session: `claude --resume <sessionId>`.

### 5.3 `@agent-saver/cli`

Standalone CLI binary. Useful for Playwright automation and non-CC contexts. Wraps the core API.

```bash
agent-saver save <name> [--description <desc>] [--global]
agent-saver load <name> [--global]
agent-saver list [--scope project|global|all]
```

### 5.4 `claude-agent-saver` (plugin)

The Claude Code plugin. Two parts:

1. **Slash commands** (`commands/save.md`, `commands/load.md`, `commands/agents.md`) — thin UX wrappers that call MCP tools.
2. **MCP server** (`mcp/server.ts`) — exposes `save_agent`, `load_agent`, `list_agents` tools. Implementation delegates to `@agent-saver/core` + `@agent-saver/adapter-claude-code`.

Plugin manifest registers both the slash commands and the MCP server entry point.

## 6. Data Model

### 6.1 Storage Layout

Two scopes coexist:

```text
<cwd>/.claude/agents/<name>/        # project-scoped (default)
~/.claude/agents/<name>/            # global (--global flag)
    ├── transcript.jsonl
    └── metadata.json
```

**Project scope** is the default — fits the primary use case A.
**Global scope** (`--global` flag) for cross-project specialists or Playwright automation.

Lookup precedence in `load`: project first, then global. Explicit scoping via `@project:name` / `@global:name` prefix to disambiguate.

### 6.2 `transcript.jsonl`

A verbatim copy of CC's JSONL session file at save time. Format owned by CC, not by us — we treat it as opaque structured data and only transform UUIDs at load time.

### 6.3 `metadata.json`

```jsonc
{
  "name": "jacob",
  "description": "auth module expert",
  "created_at": "2026-05-13T14:23:00Z",
  "agent_saver_version": "0.1.0",

  // source provenance
  "source_tool": "claude-code",
  "source_session_id": "9f3a...uuid",
  "source_cwd": "/Users/x/repos/myproj",

  // git context at save time
  "git_branch": "main",
  "git_sha": "abc123...",
  "git_dirty": false,

  // transcript stats
  "message_count": 142,
  "estimated_tokens": 87000,
  "files_touched": ["src/auth.ts", "src/middleware/jwt.ts"]
}
```

`files_touched` is populated by scanning Read/Edit/Write tool_use entries in the transcript. Used later by v2 stale-diff banner — already collected in MVP to avoid format migration.

## 7. Data Flows

### 7.1 Save flow

User in active CC session types `/save jacob "auth expert"`:

1. Slash command issues MCP tool call: `save_agent({ name: "jacob", description: "auth expert" })`.
2. MCP handler invokes `core.save(...)`.
3. Core asks the CC adapter: `detectActiveSession(cwd)`.
   - Adapter tries `$CLAUDE_SESSION_ID` env var first.
   - Falls back to most-recently-modified `~/.claude/projects/<encoded-cwd>/*.jsonl`.
4. Adapter reads the source JSONL.
5. Core collects git context (`git rev-parse HEAD`, `git status --porcelain`, `git branch --show-current`).
6. Core extracts derived metadata (message count, estimated tokens, files_touched).
7. ProjectStore writes:
   - `<cwd>/.claude/agents/jacob/transcript.jsonl` (verbatim copy)
   - `<cwd>/.claude/agents/jacob/metadata.json`
8. Return `AgentRef` to MCP handler → user sees: `✓ Saved jacob (142 msgs, ~87K tokens)`.

### 7.2 Load flow

User in fresh CC session (or anywhere) types `/load jacob`:

1. Slash command issues MCP tool call: `load_agent({ name: "jacob" })`.
2. MCP handler invokes `core.load("jacob")`.
3. Store resolves: try `<cwd>/.claude/agents/jacob/` first, then `~/.claude/agents/jacob/`.
4. Core reads `transcript.jsonl` and `metadata.json`.
5. Core asks the CC adapter: `writeTranscript(transcript, { newSessionId: <generated> })`.
   - Adapter generates a fresh UUID.
   - Adapter walks each message, rewrites `sessionId` to the new UUID, preserves `parentUuid` chain, records the original `source_session_id` as `parentSessionId` on the first message (lineage).
   - Adapter writes the resulting JSONL to `~/.claude/projects/<encoded-cwd>/<new-uuid>.jsonl`.
6. Adapter returns the shell command: `claude --resume <new-uuid>`.
7. MCP handler returns to user:

   ```text
   Loaded jacob. Run in a new terminal:

     claude --resume <new-uuid>

   (copied to clipboard)
   ```

8. User opens a new terminal, pastes, continues.

### 7.3 List flow

User types `/agents`:

1. Slash command → `list_agents({ scope: "all" })`.
2. Core walks both stores' `*/metadata.json` files.
3. Returns sorted list (most-recently-created first), annotated with scope.
4. MCP handler formats as markdown table:

```markdown
| Name  | Scope    | Age   | Msgs  | Git ref          | Description       |
|-------|----------|-------|-------|------------------|-------------------|
| jacob | project  | 2d    | 142   | main @ abc123    | auth expert       |
| sarah | global   | 1w    | 87    | -                | playwright runner |
```

## 8. Technical Decisions

| ID  | Decision                                                                          | Rationale                                                                                                            |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| K1  | Storage scope: project + global, `--global` flag                                  | Project-scoped fits use case A; global enables Playwright automation and future cross-project specialists.           |
| K2  | Session detection: `$CLAUDE_SESSION_ID` primary, mtime fallback                   | Env var is robust if set; mtime is a 99%-reliable fallback. Verify env presence during implementation.               |
| K3  | Transcript pruning: none in MVP                                                   | Ham copy preserves correctness; A2-style pruning deferred to v1.1 to avoid implementation risk in MVP.               |
| K4  | Load mechanism: print resume command + clipboard copy                             | Manual new-terminal step. Avoids OS-specific terminal spawning logic. v2 UI will auto-launch.                        |
| K5  | Repo: pnpm monorepo                                                               | Single repo for shared TS types and coordinated versioning across core/adapter/CLI/plugin.                           |
| K6  | Adapter pattern from day 1                                                        | Only one adapter ships in MVP, but the interface exists. Future Codex/Cursor adapters require no `core` changes.     |
| K7  | UI direction: TUI (Ink) first, VS Code extension next, Electron optional          | Ink reuses the same TypeScript core. TUI gives a unified management view without OS-specific work.                   |

## 9. MVP Scope

| Feature                                                | MVP | Deferred to |
| ------------------------------------------------------ | :-: | ----------- |
| `save_agent` MCP tool                                  | ✅  | —           |
| `load_agent` MCP tool                                  | ✅  | —           |
| `list_agents` MCP tool                                 | ✅  | —           |
| `/save`, `/load`, `/agents` slash commands             | ✅  | —           |
| Project + global storage scopes, `--global` flag       | ✅  | —           |
| `@agent-saver/core` library                            | ✅  | —           |
| `@agent-saver/adapter-claude-code`                     | ✅  | —           |
| `@agent-saver/cli` standalone binary                   | ✅  | —           |
| `claude-agent-saver` plugin packaging                  | ✅  | —           |
| `delete_agent` MCP tool                                | ❌  | v1.1        |
| Auto-checkpoint hook (Stop event)                      | ❌  | v1.1        |
| Transcript pruning (A2)                                | ❌  | v1.1        |
| Stale-diff banner (SessionStart hook)                  | ❌  | v2          |
| `ask_saved_agent` delegation tool                      | ❌  | v2          |
| Persona / distilled summary at save time               | ❌  | v2          |
| TUI app (Ink)                                          | ❌  | v2          |
| VS Code / Cursor extension                             | ❌  | v2          |
| Codex adapter                                          | ❌  | v2          |
| Cursor adapter                                         | ❌  | v2          |

## 10. Open Technical Questions

Validated in Phase 0 (see [`tasks/spike-findings.md`](../../tasks/spike-findings.md)).

1. **Does CC's `--resume <uuid>` accept a freshly written JSONL with a brand-new UUID placed in the project's session directory?**
   ✅ **RESOLVED — YES (Task 0.3).** Empirical round-trip in an isolated sandbox confirmed CC loads and resumes a UUID-rewritten JSONL. The model recalled the prior message verbatim. Requirements: (a) file at `~/.claude/projects/<sanitizePath(realpath(target_cwd))>/<uuid>.jsonl`, (b) `claude --resume <uuid>` run from the same `target_cwd`, (c) valid transcript chain (`uuid` + `parentUuid` linked list, transcript-type messages).

2. **Does CC set `$CLAUDE_SESSION_ID` (or equivalent) for child MCP processes?**
   ✅ **RESOLVED — NO (Task 0.2).** No `CLAUDE_SESSION_ID` exists in `process.env`. The session UUID lives only in CC's in-process state (`STATE.sessionId`). Stdio MCP children inherit the full parent `process.env` via `subprocessEnv()` (`src/utils/subprocessEnv.ts:79–99`), but no session-identifying var is written to it. **Design decision: mtime-primary detection** (scan `~/.claude/projects/**/*.jsonl` and pick the most recently modified file within a recency window).

3. **UUID rewriting safety in JSONL.**
   ✅ **RESOLVED — VALIDATED (Task 0.3).** Rule that works empirically: on every line, rewrite `sessionId` to the new UUID; on line 0 only, add `parentSessionId = <old-uuid>` for lineage. The per-message `uuid` field and the `parentUuid` linked list are NOT touched. CC accepts the result without warning and continues to write new lines into the loaded file using the new sessionId. Edge cases worth observing later: lines of type `queue-operation` / `summary` / `metadata` are ignored by the transcript loader; their presence does not break resume.

4. **Slash command → MCP tool invocation patterns.**
   Open — will be confirmed during plugin implementation (Phase 7 Task 7.6). Inspect another installed plugin under `~/.claude/plugins/cache/` for the canonical frontmatter schema; adjust if needed.

5. **Resume command and `cwd` handling.**
   ✅ **RESOLVED (Task 0.1 + 0.3).** CC's `--resume` is cwd-scoped — `loadSessionFile` constructs the JSONL path from `getOriginalCwd()` via `sanitizePath`. Running `--resume <uuid>` from a different cwd than the stored project returns `null` silently. **Design decision: the resume command must prepend `cd <source_cwd> &&` whenever the current cwd differs from `metadata.source_cwd`.** Also: `source_cwd` itself must be the `realpath`-resolved path (macOS `/tmp` ≠ `/private/tmp`).

## 10b. Implementation notes derived from Phase 0

- **Cwd encoding (Phase 5 Task 5.1):** Apply `realpathSync(cwd)` → `.normalize('NFC')` → replace `[^a-zA-Z0-9]` with `-`. If the sanitized result is > 200 chars, truncate to 200 and append a hash. CC uses `Bun.hash` (when running under Bun) or `djb2` (when running under Node); agent-saver runs under Node, so will use `djb2`. **Edge case for v1.1:** paths > 200 chars may produce a different hash than CC; mitigate via prefix-scan (mirrors CC's own `findProjectDir`).
- **Session detection (Phase 5 Task 5.2):** mtime scan of the project sessions dir, pick newest within recency window (~ 60 s). No env-based primary path. Document `CLAUDE_CODE_REMOTE_SESSION_ID` as an opportunistic future signal for remote sessions only.
- **Transcript message types** (Phase 5 Task 5.4 stats): "messages" = lines with `type` in `{user, assistant, attachment, system}`. Skip `queue-operation`, `summary`, `metadata`, `attribution-snapshot`, etc.

## 11. Success Criteria

The MVP is "done" when all of the following are true:

1. From an active CC session, `/save jacob "auth expert"` writes a transcript and metadata to `<cwd>/.claude/agents/jacob/` and reports success.
2. In a fresh CC session in the same project, `/load jacob` outputs a resume command. Running that command in a new terminal opens a CC session that continues from Jacob's saved state with full context intact.
3. `/agents` lists all saved agents (project + global) in a readable table.
4. `agent-saver save jacob --global` works from a plain shell, outside any CC session, against an arbitrary active session detected by mtime.
5. The plugin can be loaded by another developer from the repo path (no marketplace publish needed yet).
6. Round-trip integrity: a 100-message session that is saved → loaded → re-saved produces transcripts that resume identically in CC.

## 12. Risks

| Risk                                                            | Likelihood | Impact | Mitigation                                                                                                 |
| --------------------------------------------------------------- | :--------: | :----: | ---------------------------------------------------------------------------------------------------------- |
| CC's JSONL format changes between versions                      |   Medium   |  High  | Adapter pattern isolates format-specific code. Pin a tested CC version range and document.                 |
| UUID rewriting breaks `--resume` in subtle ways                 |   Medium   |  High  | Round-trip test as first implementation task.                                                              |
| `$CLAUDE_SESSION_ID` unavailable in MCP children                |   Medium   |  Low   | mtime fallback documented, race-condition window is small.                                                 |
| Disk usage from full transcript copies                          |    Low     |  Low   | Transcripts are KB-MB range. Add `agent-saver prune` in v1.1 if needed.                                    |
| User confuses project vs global scope                           |   Medium   |  Low   | `list` output annotates scope; load precedence is documented; `@project:`/`@global:` prefixes for clarity. |
| CC plugin API changes (slash command or MCP integration)        |    Low     | Medium | Pin tested CC version, gate on plugin manifest schema version.                                             |

## 13. Estimated Effort

| Phase                                                                  | Days |
| ---------------------------------------------------------------------- | :--: |
| Monorepo scaffolding (pnpm, tsconfig, package.json's, CI lint)         | 0.5  |
| `@agent-saver/core` (interfaces, stores, orchestration)                | 1.5  |
| `@agent-saver/adapter-claude-code` (JSONL read/write, session detect)  | 1.5  |
| `@agent-saver/cli`                                                     | 0.5  |
| `claude-agent-saver` plugin (commands, MCP server)                     | 1.0  |
| Integration testing (round-trip save → load → resume)                  | 1.0  |
| **Total**                                                              | ~6.0 |

## 14. Next Steps After Spec Approval

1. User reviews this spec, requests changes if any.
2. `writing-plans` skill produces `tasks/todo.md` with concrete implementation tasks.
3. Implementation: monorepo scaffold → core → adapter → CLI → plugin → integration tests.
4. v1.1 candidates (pruning, delete tool, auto-checkpoint hook) tracked as separate planning artifacts.
