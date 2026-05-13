# Phase 0 Spike Findings

## 0.1 — Resume mechanism & JSONL schema

---

### Resume logic files

| File | Lines | Role |
|------|-------|------|
| `src/utils/sessionStoragePortable.ts` | 311–319, 325–331, 403–465 | `sanitizePath()`, `getProjectDir()`, `resolveSessionFilePath()` — the canonical path-encoding and UUID-to-file lookup |
| `src/utils/sessionStorage.ts` | 202–225, 3818–3836, 3869–3931 | `getTranscriptPath()`, `loadSessionFile()`, `getLastSessionLog()` — how a session UUID maps to a JSONL on disk |
| `src/utils/conversationRecovery.ts` | 456–527 | `loadConversationForResume()` — top-level resume entry point called from CLI |
| `src/utils/sessionRestore.ts` | 409–550 | `processResumedConversation()` — calls `switchSession()` once the file is loaded |
| `src/bootstrap/state.ts` | 456–479 | `switchSession(sessionId, projectDir)` — atomically sets active session ID + project dir |
| `src/main.tsx` | 3365, 3668–3704 | CLI `--resume <uuid>` flag parsing; calls `loadConversationForResume(sessionId, undefined)` |

---

### Cwd encoding rule — confirmed

**Function:** `sanitizePath(name: string): string`
**File:** `src/utils/sessionStoragePortable.ts`, lines 311–319

```typescript
export function sanitizePath(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-')
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized
  }
  const hash =
    typeof Bun !== 'undefined' ? Bun.hash(name).toString(36) : simpleHash(name)
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${hash}`
}
```

**Rule:** every non-alphanumeric character (including `/`) is replaced with `-`.
`/Users/sezginkahraman/repos/elara` → `-Users-sezginkahraman-repos-elara`

**Confirmed from disk:** the oldest session file lives at:
```
~/.claude/projects/-Users-sezginkahraman-repos-elara/ab9848db-c874-40dd-8094-eb73f8090ebf.jsonl
```
which matches the rule exactly.

**Edge cases:**
- `MAX_SANITIZED_LENGTH = 200` (`src/utils/sessionStoragePortable.ts` line 293). Paths longer than 200 chars after sanitization get truncated to 200 chars and a hash suffix is appended.
- The hash is `Bun.hash()` when running under Bun (the CC CLI) but `djb2Hash()` when running under Node.js (the SDK). **Different runtimes produce different directory names for paths >200 chars.** `findProjectDir()` (lines 354–380) tolerates this with a prefix-scan fallback.
- Windows: colons, backslashes, and all reserved chars become hyphens. CC uses `process.platform === 'win32'` for case-insensitive directory comparisons in worktree scanning (`listSessionsImpl.ts` line 336).
- `canonicalizePath()` calls `realpath()` + `.normalize('NFC')` before encoding, so symlinks are resolved (e.g. macOS `/tmp` → `/private/tmp`). The path stored in `getOriginalCwd()` uses `realpathSync` at startup (`bootstrap/state.ts` lines 267–273).

---

### How `--resume <uuid>` finds the JSONL on disk

1. CLI parses `--resume <uuid>` → `maybeSessionId = validateUuid(options.resume)` (`main.tsx:3365`).
2. Calls `loadConversationForResume(sessionId, undefined)` (`main.tsx:3675`).
3. `conversationRecovery.ts:522` → `getLastSessionLog(sessionId)` (`sessionStorage.ts:3869`).
4. `getLastSessionLog` calls `loadSessionFile(sessionId)` (`sessionStorage.ts:3831–3835`):

```typescript
const sessionFile = join(
  getSessionProjectDir() ?? getProjectDir(getOriginalCwd()),
  `${sessionId}.jsonl`,
)
```

**Key point:** `loadSessionFile` does NOT scan all project directories. It derives the path from `getOriginalCwd()` (the cwd where `claude` was launched) + `sanitizePath()`. If the UUID lives in a different project's directory, `loadSessionFile` will silently return an empty result (file not found → empty map → `getLastSessionLog` returns `null` → `loadConversationForResume` returns `null`).

**Cross-project lookup does exist** but only for the interactive session picker (`loadMessageLogs` / `fetchLogs`) and `resolveSessionFilePath` (which scans all project dirs under `~/.claude/projects/`). The direct `--resume <uuid>` path at `main.tsx:3675` goes through `getLastSessionLog` which uses cwd-derived path only.

**Conclusion:** to resume a freshly placed JSONL with `claude --resume <uuid>`, the file **must be placed in the project directory matching the cwd where `claude` is launched** (`~/.claude/projects/<sanitizePath(cwd)>/<uuid>.jsonl`). agent-saver must therefore encode the target cwd when placing the file, not just the source cwd.

---

### JSONL message schema — observed fields

Inspected file: `~/.claude/projects/-Users-sezginkahraman-repos-elara/ab9848db-c874-40dd-8094-eb73f8090ebf.jsonl`

**Line 1–2 (type=`queue-operation`):**
```
sessionId, type, operation, timestamp
```
These are queue bookkeeping entries. `loadTranscriptFile` ignores them (`isTranscriptMessage()` returns false for this type — `sessionStorage.ts:138–145`).

**Line 3–4 (type=`attachment`):**
```
parentUuid, isSidechain, attachment, type, uuid, timestamp,
userType, entrypoint, cwd, sessionId, version, gitBranch
```

**Line 5 (type=`user`):**
```
parentUuid, isSidechain, promptId, type, message, uuid, timestamp,
permissionMode, userType, entrypoint, cwd, sessionId, version, gitBranch
```

**Transcript message types** that CC loads into the conversation chain (`isTranscriptMessage`, `sessionStorage.ts:138–145`):
- `user` — user turn
- `assistant` — assistant turn
- `attachment` — file/dir context attachments
- `system` — system messages (compact boundaries, etc.)

**Non-transcript types ignored by loader:** `queue-operation`, `summary`, `metadata`, `attribution-snapshot`, `file-history-snapshot`, `content-replacement`, `tag`, `compact_boundary` (handled separately), etc.

**Chain linkage:** each transcript message has a `uuid` (its own ID) and `parentUuid` (the ID of the previous message, or `null` for the first). `buildConversationChain()` walks this linked list from the leaf backwards.

---

### Conclusion on placing a fresh JSONL

**Evidence:** `loadSessionFile` directly constructs the path as `join(getProjectDir(getOriginalCwd()), <uuid>.jsonl)` with no fallback scan. It will read whatever file exists at that path.

**Conclusion:** CC **will** attempt to load and resume a freshly placed JSONL file, provided:
1. The file is placed at `~/.claude/projects/<sanitizePath(target-cwd)>/<new-uuid>.jsonl`
2. `claude --resume <new-uuid>` is run from the `target-cwd` directory
3. The JSONL contains valid transcript messages in the correct schema

Whether CC correctly renders and continues the conversation depends on the conversation chain being intact (valid `parentUuid` links, no orphaned tool_use without tool_result, etc.). Full empirical confirmation is **pending Task 0.3**.

---

### Open questions for Task 0.3 (empirical)

1. Does CC tolerate a JSONL that starts with `queue-operation` lines, or can we omit them?
2. Does CC require the `uuid` field in messages to match a specific pattern, or is any UUID valid?
3. Does the absence of a `summary` / `metadata` entry cause the session to be invisible in the `/resume` picker? (The picker filters sessions with no `summary` field — see `listSessionsImpl.ts:111–122`.)
4. Does compaction metadata need to be present, or does a clean transcript resume correctly?

---

## 0.2 — MCP env exposure

### MCP child spawn location

`src/services/mcp/client.ts:950` — `new StdioClientTransport({ command, args, env: { ...subprocessEnv(), ...serverRef.env } })`

### How env is constructed

The spawn env is built from two layers merged at the call site:

1. **`subprocessEnv()`** (`src/utils/subprocessEnv.ts:79–99`) — returns `process.env` with optional additions/scrubbing:
   - **Normal case (non-GHA):** returns `process.env` as-is (full parent env inheritance).
   - **GHA scrub case** (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`): returns `{ ...process.env }` with a specific allowlist of secret vars deleted (API keys, cloud creds, GitHub Actions tokens). No `CLAUDE_*` session identity vars are in the scrub list.
   - **CCR proxy case:** injects `HTTPS_PROXY` and CA bundle vars from the upstream proxy.

2. **`serverRef.env`** (`src/services/mcp/types.ts`, `McpServerConfigSchema`) — optional `Record<string, string>` from user-defined `env:` block in `claude_desktop_config.json` / project settings. These override/extend the parent env.

### Env vars explicitly set on children

No `CLAUDE_*` session identity vars are explicitly injected by CC into the MCP child env. The child inherits the full `process.env` of the CC parent process via `subprocessEnv()`.

**`CLAUDE_*` vars present in parent `process.env` at spawn time (thus inherited):**

| Var | Where set | Value |
|-----|-----------|-------|
| `CLAUDE_CODE_ENTRYPOINT` | `src/main.tsx:527/531/539` | `'mcp'` / `'cli'` / etc. — set before any MCP spawn |
| `CLAUDE_CODE_SIMPLE` | `src/main.tsx:1015` | `'1'` when simple mode |
| `CLAUDE_CODE_AGENT` | `src/main.tsx:1117` | agent CLI path |
| `CLAUDE_CODE_TASK_LIST_ID` | `src/main.tsx:1142` | task list ID (remote sessions) |
| Any `CLAUDE_CODE_*` from user environment | inherited by CC process | passed through unchanged |

These are **read** from `process.env` by the CC parent, not written to it as session-identity signals before spawning.

### `CLAUDE_SESSION_ID` exposed: **NO**

There is **no** `CLAUDE_SESSION_ID` variable. The internal session UUID is held in `STATE.sessionId` (in-process, `src/bootstrap/state.ts:331,447`), accessed via `getSessionId()` — it is **never written to `process.env`**.

The closest env analogue is `CLAUDE_CODE_REMOTE_SESSION_ID`, which is an **input** env var read from the environment (set by the remote infrastructure before launching CC), not output by CC to its children.

The `getSessionId()` UUID appears only as:
- HTTP header `X-Mcp-Client-Session-Id: <uuid>` on HTTP/SSE MCP connections (`client.ts:895`) — not in the stdio child env.
- String replacement `${CLAUDE_SESSION_ID}` in skill/plugin command templates (`SkillTool.ts:1079`, `loadPluginCommands.ts:374`) — substituted into command strings, not into the child env.

### Selected detection strategy: **mtime-primary**

**Rationale:** The session UUID is not available to MCP children via env var. The only reliable runtime signal is the mtime of JSONL files under `~/.claude/projects/`. The most-recently-modified JSONL file belongs to the active session. agent-saver should:

1. **Primary:** mtime scan of `~/.claude/projects/**/*.jsonl` — pick the file modified most recently (within a recency window, e.g. < 60 s).
2. **Fallback / disambiguation:** If multiple files are within the window, rank by mtime desc and pick the newest.
3. **Env opportunistic bonus:** If the user's shell has `CLAUDE_CODE_REMOTE_SESSION_ID` set in the environment that launched CC, it will be present in the MCP child env — but this only applies to remote/CCR sessions, not local interactive sessions.

**Conclusion:** env-based detection is unreliable for the primary local use case. mtime-primary is the correct strategy.
