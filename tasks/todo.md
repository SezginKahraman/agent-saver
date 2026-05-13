# agent-saver MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude Code plugin + standalone CLI that lets users snapshot the active session as a named agent and reload it in a fresh terminal — the "save the golden moment" workflow described in [`docs/specs/2026-05-13-agent-saver-mvp-design.md`](../docs/specs/2026-05-13-agent-saver-mvp-design.md).

**Architecture:** TypeScript monorepo (pnpm workspaces) with a framework-free `@agent-saver/core` library that orchestrates save/load/list through a `ToolAdapter` interface. The MVP ships exactly one adapter (`@agent-saver/adapter-claude-code`) plus two consumers: `@agent-saver/cli` (standalone binary) and `claude-agent-saver` (CC plugin = slash commands + MCP server).

**Tech Stack:**

- TypeScript ~5.4, Node ≥ 20
- pnpm workspaces
- vitest for unit + integration tests
- `@modelcontextprotocol/sdk` for the MCP server
- `commander` for CLI arg parsing
- `clipboardy` for clipboard interaction
- Built-in `node:fs/promises`, `node:crypto`, `node:child_process` (no heavyweight deps in core)

---

## Target File Structure

```text
agent-saver/
├── package.json                                   # root, workspaces declaration
├── pnpm-workspace.yaml
├── tsconfig.base.json                             # shared TS compiler options
├── tsconfig.json                                  # root references
├── vitest.config.ts                               # shared vitest config
├── .npmrc
├── .nvmrc
│
└── packages/
    ├── core/                                      # @agent-saver/core
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── src/
    │   │   ├── index.ts                           # public API barrel
    │   │   ├── types.ts                           # AgentRef, Metadata, opts/results
    │   │   ├── adapter.ts                         # ToolAdapter interface
    │   │   ├── store/
    │   │   │   ├── index.ts                       # AgentStore interface
    │   │   │   ├── fs-store.ts                    # shared filesystem implementation
    │   │   │   ├── project-store.ts               # ProjectStore (cwd/.claude/agents)
    │   │   │   └── global-store.ts                # GlobalStore (~/.claude/agents)
    │   │   ├── operations/
    │   │   │   ├── save.ts
    │   │   │   ├── load.ts
    │   │   │   └── list.ts
    │   │   ├── git.ts                             # git context collection
    │   │   └── version.ts                         # VERSION constant
    │   └── tests/
    │       ├── fs-store.test.ts
    │       ├── save.test.ts
    │       ├── load.test.ts
    │       ├── list.test.ts
    │       └── git.test.ts
    │
    ├── adapter-claude-code/                       # @agent-saver/adapter-claude-code
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── src/
    │   │   ├── index.ts                           # exports ClaudeCodeAdapter
    │   │   ├── adapter.ts                         # class composing the modules below
    │   │   ├── paths.ts                           # encodedCwd, projectsDir helpers
    │   │   ├── session-detect.ts                  # env + mtime detection
    │   │   ├── transcript-io.ts                   # read/write JSONL
    │   │   ├── transcript-stats.ts                # countMessages, estimateTokens
    │   │   ├── files-touched.ts                   # extract filenames from tool_use
    │   │   ├── uuid-rewrite.ts                    # JSONL transformation on load
    │   │   └── resume-cmd.ts                      # build `cd && claude --resume` string
    │   └── tests/
    │       ├── paths.test.ts
    │       ├── session-detect.test.ts
    │       ├── transcript-io.test.ts
    │       ├── transcript-stats.test.ts
    │       ├── files-touched.test.ts
    │       ├── uuid-rewrite.test.ts
    │       ├── resume-cmd.test.ts
    │       ├── adapter.integration.test.ts        # round-trip against real fixture
    │       └── fixtures/
    │           └── sample-session.jsonl
    │
    ├── cli/                                       # @agent-saver/cli
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── src/
    │   │   ├── index.ts                           # bin entry (#!/usr/bin/env node)
    │   │   ├── program.ts                         # commander program builder
    │   │   ├── commands/
    │   │   │   ├── save.ts
    │   │   │   ├── load.ts
    │   │   │   └── list.ts
    │   │   └── format.ts                          # output formatting
    │   └── tests/
    │       └── commands.test.ts
    │
    └── plugin-claude-code/                        # claude-agent-saver
        ├── plugin.json                            # CC plugin manifest
        ├── package.json
        ├── tsconfig.json
        ├── commands/
        │   ├── save.md
        │   ├── load.md
        │   └── agents.md
        └── mcp/
            ├── server.ts                          # MCP server entrypoint
            └── tools/
                ├── save-agent.ts
                ├── load-agent.ts
                └── list-agents.ts
```

---

## Phase 0: Validation Spikes (do FIRST)

These five questions from [spec §10](../docs/specs/2026-05-13-agent-saver-mvp-design.md#10-open-technical-questions) must be answered before writing production code. If any fails, the architecture needs adjustment.

### Task 0.1: Verify `claude --resume` accepts a placed JSONL with a new UUID

**Files:**

- Scratch directory: `/tmp/agent-saver-spike/`

- [ ] **Step 1: Find a real CC session JSONL to clone**

```bash
ls -lt ~/.claude/projects/-Users-sezginkahraman-repos-claude-code-main/*.jsonl | head -3
```

Pick one with at least 20 messages. Record its UUID (the filename minus `.jsonl`).

- [ ] **Step 2: Generate a new UUID and clone the file**

```bash
NEW_UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
SRC=~/.claude/projects/-Users-sezginkahraman-repos-claude-code-main/<old-uuid>.jsonl
DST=~/.claude/projects/-Users-sezginkahraman-repos-claude-code-main/$NEW_UUID.jsonl
cp "$SRC" "$DST"
echo "New session UUID: $NEW_UUID"
```

- [ ] **Step 3: Rewrite `sessionId` fields in the cloned file**

```bash
OLD_UUID=<old-uuid from step 1>
node -e "
const fs = require('fs');
const path = process.argv[1];
const oldId = process.argv[2];
const newId = process.argv[3];
const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
const rewritten = lines.map(line => {
  const obj = JSON.parse(line);
  if (obj.sessionId === oldId) obj.sessionId = newId;
  return JSON.stringify(obj);
}).join('\n') + '\n';
fs.writeFileSync(path, rewritten);
console.log('rewrote', lines.length, 'lines');
" "$DST" "$OLD_UUID" "$NEW_UUID"
```

- [ ] **Step 4: Attempt resume**

```bash
cd ~/repos/claude-code-main
claude --resume $NEW_UUID
```

Expected: CC opens the session with the conversation visible. If it errors or shows an empty session, capture the exact error and stop — design needs revision.

- [ ] **Step 5: Document the outcome**

Append findings to `docs/specs/2026-05-13-agent-saver-mvp-design.md` §10 question 1 (replace "Needs hands-on test" with the actual result). Commit:

```bash
cd ~/repos/agent-saver
git add docs/specs/
git commit -m "spike: confirm --resume accepts placed JSONL with rewritten UUIDs"
```

### Task 0.2: Check whether `$CLAUDE_SESSION_ID` is exposed to MCP processes

**Files:**

- Scratch: `/tmp/env-spike/`

- [ ] **Step 1: Write a tiny MCP server that dumps its env**

```bash
mkdir -p /tmp/env-spike && cd /tmp/env-spike
cat > server.js <<'EOF'
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'node:fs';

const out = Object.entries(process.env)
  .filter(([k]) => /CLAUDE|SESSION/i.test(k))
  .map(([k, v]) => `${k}=${v}`).join('\n');
fs.writeFileSync('/tmp/env-spike/env-dump.txt', out || '(no matching vars)');

const server = new Server({ name: 'env-spike', version: '0.0.1' }, { capabilities: {} });
const transport = new StdioServerTransport();
await server.connect(transport);
EOF
npm init -y && npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Register as a CC MCP server in a throwaway settings file**

Add to `~/.claude/settings.local.json` (or wherever CC reads MCP config):

```json
{
  "mcpServers": {
    "env-spike": {
      "command": "node",
      "args": ["/tmp/env-spike/server.js"]
    }
  }
}
```

- [ ] **Step 3: Launch CC in a project, then read the dumped env**

```bash
claude  # in any project; close after it boots
cat /tmp/env-spike/env-dump.txt
```

- [ ] **Step 4: Record findings**

Update spec §10 question 2. Possible outcomes:

- `CLAUDE_SESSION_ID` present → use as primary detection signal.
- Only `CLAUDE_*` variants → identify the right one.
- None → mtime fallback becomes primary path.

Commit findings:

```bash
git add docs/specs/
git commit -m "spike: document MCP env exposure for session detection"
```

- [ ] **Step 5: Remove the spike MCP server from settings**

Edit `~/.claude/settings.local.json` to remove the `env-spike` entry. `rm -rf /tmp/env-spike`.

### Task 0.3: Round-trip UUID rewriting on a real transcript

**Files:**

- Scratch: `/tmp/uuid-spike/`

- [ ] **Step 1: Clone the same source JSONL used in Task 0.1**

```bash
mkdir -p /tmp/uuid-spike && cp <src.jsonl> /tmp/uuid-spike/src.jsonl
```

- [ ] **Step 2: Build a rewrite + verify script**

```bash
cat > /tmp/uuid-spike/roundtrip.js <<'EOF'
const fs = require('fs');
const crypto = require('crypto');

const src = '/tmp/uuid-spike/src.jsonl';
const dst = '/tmp/uuid-spike/rewritten.jsonl';
const lines = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean);
const original = lines.map(l => JSON.parse(l));
const oldSession = original[0].sessionId;
const newSession = crypto.randomUUID();

const rewritten = original.map((m, i) => {
  const out = { ...m, sessionId: newSession };
  if (i === 0) out.parentSessionId = oldSession;
  return out;
});

fs.writeFileSync(dst, rewritten.map(JSON.stringify).join('\n') + '\n');

// Verify:
// 1. sessionId changed on every line
// 2. parentUuid chain unchanged
// 3. first message has parentSessionId === oldSession
console.assert(rewritten.every(m => m.sessionId === newSession));
console.assert(rewritten.every((m, i) => m.parentUuid === original[i].parentUuid));
console.assert(rewritten[0].parentSessionId === oldSession);
console.log('OK', { oldSession, newSession, lines: lines.length });
EOF
node /tmp/uuid-spike/roundtrip.js
```

Expected: prints `OK { oldSession, newSession, lines }`.

- [ ] **Step 3: Resume the rewritten file in CC**

```bash
NEW_UUID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/uuid-spike/rewritten.jsonl').toString().split('\n')[0]).sessionId)")
cp /tmp/uuid-spike/rewritten.jsonl ~/.claude/projects/-Users-sezginkahraman-repos-claude-code-main/$NEW_UUID.jsonl
cd ~/repos/claude-code-main
claude --resume $NEW_UUID
```

- [ ] **Step 4: Visually verify the session loads with all messages intact**

If yes: rewrite algorithm validated. If no: capture error, debug, iterate. Document in spec §10 question 3.

- [ ] **Step 5: Cleanup and commit findings**

```bash
rm -rf /tmp/uuid-spike /tmp/agent-saver-spike
rm ~/.claude/projects/-Users-sezginkahraman-repos-claude-code-main/$NEW_UUID.jsonl
cd ~/repos/agent-saver
git add docs/specs/
git commit -m "spike: validate UUID rewrite roundtrip"
```

---

## Phase 1: Monorepo Scaffolding

### Task 1.1: Root monorepo config

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `.npmrc`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Write `.nvmrc`**

```text
20
```

- [ ] **Step 2: Write `.npmrc`**

```text
strict-peer-dependencies=false
auto-install-peers=true
```

- [ ] **Step 3: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 4: Write root `package.json`**

```json
{
  "name": "agent-saver",
  "version": "0.1.0",
  "private": true,
  "description": "Save, version, and reload Claude Code agent sessions.",
  "license": "UNLICENSED",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "lint": "echo 'lint not configured yet'",
    "clean": "pnpm -r exec rm -rf dist .tsbuildinfo"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "~5.4.0",
    "vitest": "^1.4.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 5: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "composite": true,
    "incremental": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 6: Write root `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/adapter-claude-code" },
    { "path": "packages/cli" },
    { "path": "packages/plugin-claude-code" }
  ]
}
```

- [ ] **Step 7: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['packages/*/tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 8: Install root devDependencies**

```bash
cd ~/repos/agent-saver
pnpm install
```

Expected: `node_modules/` created, lockfile generated.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-workspace.yaml .nvmrc .npmrc tsconfig.base.json tsconfig.json vitest.config.ts pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo with shared TS/vitest config"
```

### Task 1.2: Create empty workspace package directories

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/adapter-claude-code/package.json`
- Create: `packages/adapter-claude-code/tsconfig.json`
- Create: `packages/adapter-claude-code/src/index.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/plugin-claude-code/package.json`
- Create: `packages/plugin-claude-code/tsconfig.json`

- [ ] **Step 1: `packages/core/package.json`**

```json
{
  "name": "@agent-saver/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "tsBuildInfoFile": "./.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: `packages/core/src/index.ts` placeholder**

```typescript
export const VERSION = '0.1.0';
```

- [ ] **Step 4: Repeat steps 1–3 for `adapter-claude-code`**

```json
// packages/adapter-claude-code/package.json
{
  "name": "@agent-saver/adapter-claude-code",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@agent-saver/core": "workspace:*"
  }
}
```

`tsconfig.json` adds a reference to core:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "tsBuildInfoFile": "./.tsbuildinfo"
  },
  "references": [{ "path": "../core" }],
  "include": ["src/**/*.ts"]
}
```

`src/index.ts` placeholder: `export {};`

- [ ] **Step 5: Repeat for `cli`**

```json
// packages/cli/package.json
{
  "name": "@agent-saver/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "bin": {
    "agent-saver": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@agent-saver/core": "workspace:*",
    "@agent-saver/adapter-claude-code": "workspace:*",
    "commander": "^12.0.0",
    "clipboardy": "^4.0.0"
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "tsBuildInfoFile": "./.tsbuildinfo"
  },
  "references": [
    { "path": "../core" },
    { "path": "../adapter-claude-code" }
  ],
  "include": ["src/**/*.ts"]
}
```

`src/index.ts`:

```typescript
#!/usr/bin/env node
// CLI entrypoint — implemented in Phase 4
console.log('agent-saver CLI (stub)');
```

- [ ] **Step 6: Repeat for `plugin-claude-code`**

```json
// packages/plugin-claude-code/package.json
{
  "name": "claude-agent-saver",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@agent-saver/core": "workspace:*",
    "@agent-saver/adapter-claude-code": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

`tsconfig.json` (note: `rootDir: "./mcp"`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./mcp",
    "outDir": "./dist",
    "tsBuildInfoFile": "./.tsbuildinfo"
  },
  "references": [
    { "path": "../core" },
    { "path": "../adapter-claude-code" }
  ],
  "include": ["mcp/**/*.ts"]
}
```

- [ ] **Step 7: Install workspace deps**

```bash
pnpm install
```

Expected: pnpm links workspace packages to each other, no errors.

- [ ] **Step 8: Build everything succeeds**

```bash
pnpm build
```

Expected: all four packages compile (mostly trivial stubs). `dist/` dirs created.

- [ ] **Step 9: Commit**

```bash
git add packages/ pnpm-lock.yaml
git commit -m "chore: create empty workspace packages (core, adapter-cc, cli, plugin-cc)"
```

---

## Phase 2: Core Types and Interfaces

### Task 2.1: Define core types

**Files:**

- Create: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write `types.ts`**

```typescript
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
```

- [ ] **Step 2: Update `src/index.ts` to re-export types**

```typescript
export * from './types.js';
export { VERSION } from './version.js';
```

- [ ] **Step 3: Create `src/version.ts`**

```typescript
export const VERSION = '0.1.0';
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @agent-saver/core typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "feat(core): define AgentRef, Metadata, opts, and result types"
```

### Task 2.2: Define ToolAdapter interface

**Files:**

- Create: `packages/core/src/adapter.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write `adapter.ts`**

```typescript
// packages/core/src/adapter.ts
import type { RawTranscript } from './types.js';

export interface WriteOpts {
  /** Fresh session UUID to assign on every message. */
  newSessionId: string;
  /** Original session UUID, recorded on the first message for lineage. */
  parentSessionId: string;
  /** Project cwd the new session belongs to (used to locate target dir). */
  targetCwd: string;
}

export interface ToolAdapter {
  /** Identifier used in metadata.source_tool. */
  readonly toolName: string;

  /** Returns the active session ID for the given cwd, or null if none. */
  detectActiveSession(cwd: string): Promise<string | null>;

  /** Reads a saved transcript by session ID. */
  readTranscript(sessionId: string, cwd: string): Promise<RawTranscript>;

  /** Writes a transcript to the tool's session store. Returns the new session ID. */
  writeTranscript(transcript: RawTranscript, opts: WriteOpts): Promise<string>;

  /** Builds a shell command the user can paste to resume the session. */
  resumeCommand(sessionId: string, sourceCwd: string, currentCwd: string): string;

  /** Extracts file paths referenced by Read/Edit/Write tool_use entries. */
  extractFilesTouched(transcript: RawTranscript): string[];

  /** Counts conversational messages (user + assistant). */
  countMessages(transcript: RawTranscript): number;

  /** Estimates total tokens. Coarse char-based heuristic is fine. */
  estimateTokens(transcript: RawTranscript): number;
}
```

- [ ] **Step 2: Re-export from `index.ts`**

```typescript
// packages/core/src/index.ts
export * from './types.js';
export * from './adapter.js';
export { VERSION } from './version.js';
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm --filter @agent-saver/core typecheck
git add packages/core/
git commit -m "feat(core): define ToolAdapter interface"
```

### Task 2.3: Define AgentStore interface

**Files:**

- Create: `packages/core/src/store/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write store interface**

```typescript
// packages/core/src/store/index.ts
import type { AgentRef, Metadata, RawTranscript, Scope } from '../types.js';

export interface SavedAgent {
  transcript: RawTranscript;
  metadata: Metadata;
  ref: AgentRef;
}

export interface AgentStore {
  readonly scope: Scope;
  readonly baseDir: string;

  has(name: string): Promise<boolean>;
  save(name: string, transcript: RawTranscript, metadata: Metadata): Promise<AgentRef>;
  read(name: string): Promise<SavedAgent>;
  list(): Promise<AgentRef[]>;
}
```

- [ ] **Step 2: Re-export from `index.ts`**

```typescript
export * from './types.js';
export * from './adapter.js';
export * from './store/index.js';
export { VERSION } from './version.js';
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm --filter @agent-saver/core typecheck
git add packages/core/
git commit -m "feat(core): define AgentStore interface"
```

---

## Phase 3: Core Storage Implementation

### Task 3.1: Filesystem-based store (TDD)

**Files:**

- Create: `packages/core/src/store/fs-store.ts`
- Create: `packages/core/tests/fs-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/fs-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsStore } from '../src/store/fs-store.js';
import type { Metadata, RawTranscript } from '../src/types.js';

function makeFixture() {
  const transcript: RawTranscript = { raw: '{"hello":"world"}\n' };
  const metadata: Metadata = {
    name: 'jacob',
    description: 'auth expert',
    created_at: '2026-05-13T00:00:00Z',
    agent_saver_version: '0.1.0',
    source_tool: 'claude-code',
    source_session_id: 'abc-123',
    source_cwd: '/tmp/proj',
    message_count: 42,
    estimated_tokens: 1000,
    files_touched: ['src/auth.ts'],
  };
  return { transcript, metadata };
}

describe('FsStore', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'agent-saver-test-'));
  });

  it('saves and reads back an agent', async () => {
    const store = new FsStore('project', baseDir);
    const { transcript, metadata } = makeFixture();

    const ref = await store.save('jacob', transcript, metadata);

    expect(ref.name).toBe('jacob');
    expect(ref.scope).toBe('project');
    expect(ref.path).toBe(join(baseDir, 'jacob'));

    const round = await store.read('jacob');
    expect(round.transcript.raw).toBe(transcript.raw);
    expect(round.metadata.name).toBe('jacob');
    expect(round.metadata.files_touched).toEqual(['src/auth.ts']);
  });

  it('has() returns true after save, false otherwise', async () => {
    const store = new FsStore('global', baseDir);
    expect(await store.has('nobody')).toBe(false);

    const { transcript, metadata } = makeFixture();
    await store.save('sarah', transcript, metadata);

    expect(await store.has('sarah')).toBe(true);
    expect(await store.has('nobody')).toBe(false);
  });

  it('list() returns all saved agents', async () => {
    const store = new FsStore('project', baseDir);
    const { transcript, metadata } = makeFixture();

    await store.save('a', transcript, { ...metadata, name: 'a' });
    await store.save('b', transcript, { ...metadata, name: 'b' });

    const all = await store.list();
    const names = all.map((r) => r.name).sort();
    expect(names).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/core/tests/fs-store.test.ts
```

Expected: FAIL with "Cannot find module '../src/store/fs-store.js'".

- [ ] **Step 3: Implement `FsStore`**

```typescript
// packages/core/src/store/fs-store.ts
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentRef, Metadata, RawTranscript, Scope } from '../types.js';
import type { AgentStore, SavedAgent } from './index.js';

export class FsStore implements AgentStore {
  constructor(public readonly scope: Scope, public readonly baseDir: string) {}

  private agentDir(name: string): string {
    return join(this.baseDir, name);
  }

  async has(name: string): Promise<boolean> {
    try {
      await stat(join(this.agentDir(name), 'metadata.json'));
      return true;
    } catch {
      return false;
    }
  }

  async save(name: string, transcript: RawTranscript, metadata: Metadata): Promise<AgentRef> {
    const dir = this.agentDir(name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'transcript.jsonl'), transcript.raw, 'utf8');
    await writeFile(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');
    return { name, scope: this.scope, path: dir, metadata };
  }

  async read(name: string): Promise<SavedAgent> {
    const dir = this.agentDir(name);
    const [raw, metaText] = await Promise.all([
      readFile(join(dir, 'transcript.jsonl'), 'utf8'),
      readFile(join(dir, 'metadata.json'), 'utf8'),
    ]);
    const metadata = JSON.parse(metaText) as Metadata;
    return {
      transcript: { raw },
      metadata,
      ref: { name, scope: this.scope, path: dir, metadata },
    };
  }

  async list(): Promise<AgentRef[]> {
    let entries: string[];
    try {
      entries = await readdir(this.baseDir);
    } catch {
      return [];
    }
    const refs: AgentRef[] = [];
    for (const name of entries) {
      try {
        const dir = this.agentDir(name);
        const metaText = await readFile(join(dir, 'metadata.json'), 'utf8');
        const metadata = JSON.parse(metaText) as Metadata;
        refs.push({ name, scope: this.scope, path: dir, metadata });
      } catch {
        // skip non-agent dirs
      }
    }
    return refs;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run packages/core/tests/fs-store.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/store/fs-store.ts packages/core/tests/fs-store.test.ts
git commit -m "feat(core): filesystem-backed AgentStore with save/read/list/has"
```

### Task 3.2: ProjectStore and GlobalStore thin wrappers

**Files:**

- Create: `packages/core/src/store/project-store.ts`
- Create: `packages/core/src/store/global-store.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write `project-store.ts`**

```typescript
// packages/core/src/store/project-store.ts
import { join } from 'node:path';
import { FsStore } from './fs-store.js';

export class ProjectStore extends FsStore {
  constructor(cwd: string) {
    super('project', join(cwd, '.claude', 'agents'));
  }
}
```

- [ ] **Step 2: Write `global-store.ts`**

```typescript
// packages/core/src/store/global-store.ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FsStore } from './fs-store.js';

export class GlobalStore extends FsStore {
  constructor() {
    super('global', join(homedir(), '.claude', 'agents'));
  }
}
```

- [ ] **Step 3: Re-export from `index.ts`**

```typescript
export * from './types.js';
export * from './adapter.js';
export * from './store/index.js';
export { FsStore } from './store/fs-store.js';
export { ProjectStore } from './store/project-store.js';
export { GlobalStore } from './store/global-store.js';
export { VERSION } from './version.js';
```

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm --filter @agent-saver/core typecheck
git add packages/core/
git commit -m "feat(core): ProjectStore and GlobalStore wrappers"
```

---

## Phase 4: Core Operations

### Task 4.1: Git context helper (TDD)

**Files:**

- Create: `packages/core/src/git.ts`
- Create: `packages/core/tests/git.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/git.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { collectGitContext } from '../src/git.js';

describe('collectGitContext', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'agent-saver-git-'));
    execSync('git init -b main', { cwd: repo });
    execSync('git config user.email t@t.t && git config user.name t', { cwd: repo, shell: '/bin/bash' });
    execSync('echo hello > a.txt && git add a.txt && git commit -m init', { cwd: repo, shell: '/bin/bash' });
  });

  it('returns sha, branch, and dirty flag', async () => {
    const ctx = await collectGitContext(repo);
    expect(ctx.git_branch).toBe('main');
    expect(ctx.git_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(ctx.git_dirty).toBe(false);
  });

  it('detects dirty working tree', async () => {
    execSync('echo dirty > a.txt', { cwd: repo, shell: '/bin/bash' });
    const ctx = await collectGitContext(repo);
    expect(ctx.git_dirty).toBe(true);
  });

  it('returns empty object outside a git repo', async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), 'no-git-'));
    const ctx = await collectGitContext(nonRepo);
    expect(ctx).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/core/tests/git.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `git.ts`**

```typescript
// packages/core/src/git.ts
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(exec);

export interface GitContext {
  git_branch?: string;
  git_sha?: string;
  git_dirty?: boolean;
}

async function tryGit(args: string, cwd: string): Promise<string | null> {
  try {
    const { stdout } = await pexec(`git ${args}`, { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function collectGitContext(cwd: string): Promise<GitContext> {
  const inside = await tryGit('rev-parse --is-inside-work-tree', cwd);
  if (inside !== 'true') return {};

  const [sha, branch, status] = await Promise.all([
    tryGit('rev-parse HEAD', cwd),
    tryGit('branch --show-current', cwd),
    tryGit('status --porcelain', cwd),
  ]);

  const ctx: GitContext = {};
  if (sha) ctx.git_sha = sha;
  if (branch) ctx.git_branch = branch;
  if (status !== null) ctx.git_dirty = status.length > 0;
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run packages/core/tests/git.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/git.ts packages/core/tests/git.test.ts
git commit -m "feat(core): collectGitContext returns sha/branch/dirty flag"
```

### Task 4.2: save() operation (TDD)

**Files:**

- Create: `packages/core/src/operations/save.ts`
- Create: `packages/core/tests/save.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/save.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { save } from '../src/operations/save.js';
import { ProjectStore } from '../src/store/project-store.js';
import type { ToolAdapter, WriteOpts } from '../src/adapter.js';
import type { RawTranscript } from '../src/types.js';

class MockAdapter implements ToolAdapter {
  readonly toolName = 'mock';
  constructor(public sessionId = 'mock-session-id', public raw = '{"m":1}\n{"m":2}\n') {}
  async detectActiveSession(): Promise<string | null> {
    return this.sessionId;
  }
  async readTranscript(): Promise<RawTranscript> {
    return { raw: this.raw };
  }
  async writeTranscript(_t: RawTranscript, _opts: WriteOpts): Promise<string> {
    throw new Error('not used in save');
  }
  resumeCommand(): string {
    return 'mock-resume';
  }
  extractFilesTouched(): string[] {
    return ['src/x.ts'];
  }
  countMessages(): number {
    return 2;
  }
  estimateTokens(): number {
    return 100;
  }
}

describe('save', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'save-test-'));
    execSync('git init -b main', { cwd: repo });
    execSync('git config user.email t@t.t && git config user.name t', { cwd: repo, shell: '/bin/bash' });
    await writeFile(join(repo, 'a.txt'), 'hi');
    execSync('git add . && git commit -m init', { cwd: repo, shell: '/bin/bash' });
  });

  it('writes transcript and metadata to project scope', async () => {
    const adapter = new MockAdapter();
    const ref = await save(adapter, 'jacob', { cwd: repo, description: 'auth' });

    expect(ref.name).toBe('jacob');
    expect(ref.scope).toBe('project');
    expect(ref.metadata.source_tool).toBe('mock');
    expect(ref.metadata.source_session_id).toBe('mock-session-id');
    expect(ref.metadata.message_count).toBe(2);
    expect(ref.metadata.estimated_tokens).toBe(100);
    expect(ref.metadata.files_touched).toEqual(['src/x.ts']);
    expect(ref.metadata.git_branch).toBe('main');
    expect(ref.metadata.git_dirty).toBe(false);

    // verify on disk
    const reread = await new ProjectStore(repo).read('jacob');
    expect(reread.metadata.description).toBe('auth');
  });

  it('honors scope: global', async () => {
    const adapter = new MockAdapter();
    // Use HOME override so we don't pollute the real home dir
    const fakeHome = await mkdtemp(join(tmpdir(), 'home-'));
    process.env.HOME = fakeHome;
    const ref = await save(adapter, 'shared', { cwd: repo, scope: 'global' });
    expect(ref.scope).toBe('global');
    expect(ref.path).toMatch(/\/.claude\/agents\/shared$/);
  });

  it('throws when adapter detects no active session', async () => {
    const adapter = new MockAdapter('');
    adapter.sessionId = '';
    (adapter as unknown as { detectActiveSession: () => Promise<null> }).detectActiveSession =
      async () => null;
    await expect(save(adapter, 'x', { cwd: repo })).rejects.toThrow(/no active session/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/core/tests/save.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `save.ts`**

```typescript
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
    throw new Error('no active session detected — pass --session-id explicitly?');
  }

  const transcript = await adapter.readTranscript(sessionId, cwd);
  const git = await collectGitContext(cwd);

  const metadata: Metadata = {
    name,
    description: opts.description,
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run packages/core/tests/save.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/operations/save.ts packages/core/tests/save.test.ts
git commit -m "feat(core): save() orchestrates adapter + git context + store"
```

### Task 4.3: load() operation (TDD)

**Files:**

- Create: `packages/core/src/operations/load.ts`
- Create: `packages/core/tests/load.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/load.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from '../src/operations/load.js';
import { ProjectStore } from '../src/store/project-store.js';
import type { Metadata, RawTranscript } from '../src/types.js';
import type { ToolAdapter, WriteOpts } from '../src/adapter.js';

class MockAdapter implements ToolAdapter {
  readonly toolName = 'mock';
  public lastWriteOpts?: WriteOpts;
  async detectActiveSession() {
    return null;
  }
  async readTranscript(): Promise<RawTranscript> {
    return { raw: '' };
  }
  async writeTranscript(_t: RawTranscript, opts: WriteOpts): Promise<string> {
    this.lastWriteOpts = opts;
    return opts.newSessionId;
  }
  resumeCommand(sessionId: string, sourceCwd: string, currentCwd: string): string {
    if (sourceCwd === currentCwd) return `claude --resume ${sessionId}`;
    return `cd ${sourceCwd} && claude --resume ${sessionId}`;
  }
  extractFilesTouched() {
    return [];
  }
  countMessages() {
    return 0;
  }
  estimateTokens() {
    return 0;
  }
}

function metaFixture(name: string, sourceCwd: string): Metadata {
  return {
    name,
    created_at: '2026-05-13T00:00:00Z',
    agent_saver_version: '0.1.0',
    source_tool: 'mock',
    source_session_id: 'orig-session',
    source_cwd: sourceCwd,
    message_count: 5,
    estimated_tokens: 100,
    files_touched: [],
  };
}

describe('load', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'load-test-'));
  });

  it('loads project-scoped agent and returns resume command for same cwd', async () => {
    const store = new ProjectStore(repo);
    await store.save('jacob', { raw: 'x' }, metaFixture('jacob', repo));

    const adapter = new MockAdapter();
    const result = await load(adapter, 'jacob', { cwd: repo });

    expect(result.agent.name).toBe('jacob');
    expect(result.newSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.resumeCommand).toBe(`claude --resume ${result.newSessionId}`);
    expect(adapter.lastWriteOpts?.parentSessionId).toBe('orig-session');
    expect(adapter.lastWriteOpts?.targetCwd).toBe(repo);
  });

  it('throws when name does not exist', async () => {
    const adapter = new MockAdapter();
    await expect(load(adapter, 'missing', { cwd: repo })).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/core/tests/load.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `load.ts`**

```typescript
// packages/core/src/operations/load.ts
import { randomUUID } from 'node:crypto';
import type { ToolAdapter } from '../adapter.js';
import type { LoadOpts, LoadResult } from '../types.js';
import { ProjectStore } from '../store/project-store.js';
import { GlobalStore } from '../store/global-store.js';

export async function load(
  adapter: ToolAdapter,
  name: string,
  opts: LoadOpts = {},
): Promise<LoadResult> {
  const cwd = opts.cwd ?? process.cwd();
  const scopePref = opts.scope ?? 'auto';

  const projectStore = new ProjectStore(cwd);
  const globalStore = new GlobalStore();

  let found: Awaited<ReturnType<typeof projectStore.read>> | null = null;
  if (scopePref !== 'global' && (await projectStore.has(name))) {
    found = await projectStore.read(name);
  } else if (scopePref !== 'project' && (await globalStore.has(name))) {
    found = await globalStore.read(name);
  }
  if (!found) {
    throw new Error(`agent "${name}" not found in scope ${scopePref}`);
  }

  const newSessionId = randomUUID();
  await adapter.writeTranscript(found.transcript, {
    newSessionId,
    parentSessionId: found.metadata.source_session_id,
    targetCwd: found.metadata.source_cwd,
  });

  const resumeCommand = adapter.resumeCommand(newSessionId, found.metadata.source_cwd, cwd);
  return { agent: found.ref, newSessionId, resumeCommand };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run packages/core/tests/load.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/operations/load.ts packages/core/tests/load.test.ts
git commit -m "feat(core): load() resolves scope, rewrites session, builds resume cmd"
```

### Task 4.4: list() operation (TDD)

**Files:**

- Create: `packages/core/src/operations/list.ts`
- Create: `packages/core/tests/list.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/list.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { list } from '../src/operations/list.js';
import { ProjectStore } from '../src/store/project-store.js';
import { GlobalStore } from '../src/store/global-store.js';
import type { Metadata } from '../src/types.js';

function meta(name: string, cwd: string): Metadata {
  return {
    name,
    created_at: '2026-05-13T00:00:00Z',
    agent_saver_version: '0.1.0',
    source_tool: 'mock',
    source_session_id: 'sid',
    source_cwd: cwd,
    message_count: 0,
    estimated_tokens: 0,
    files_touched: [],
  };
}

describe('list', () => {
  let repo: string;
  let fakeHome: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'list-repo-'));
    fakeHome = await mkdtemp(join(tmpdir(), 'list-home-'));
    process.env.HOME = fakeHome;
  });

  it('returns project + global combined when scope=auto', async () => {
    await new ProjectStore(repo).save('a', { raw: '' }, meta('a', repo));
    await new GlobalStore().save('b', { raw: '' }, meta('b', repo));

    const all = await list({ cwd: repo, scope: 'auto' });
    const names = all.map((r) => `${r.scope}/${r.name}`).sort();
    expect(names).toEqual(['global/b', 'project/a']);
  });

  it('respects scope=project', async () => {
    await new ProjectStore(repo).save('a', { raw: '' }, meta('a', repo));
    await new GlobalStore().save('b', { raw: '' }, meta('b', repo));

    const out = await list({ cwd: repo, scope: 'project' });
    expect(out.map((r) => r.name)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/core/tests/list.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `list.ts`**

```typescript
// packages/core/src/operations/list.ts
import type { AgentRef, ListOpts } from '../types.js';
import { ProjectStore } from '../store/project-store.js';
import { GlobalStore } from '../store/global-store.js';

export async function list(opts: ListOpts = {}): Promise<AgentRef[]> {
  const cwd = opts.cwd ?? process.cwd();
  const scope = opts.scope ?? 'auto';

  const projectAgents = scope === 'global' ? [] : await new ProjectStore(cwd).list();
  const globalAgents = scope === 'project' ? [] : await new GlobalStore().list();

  return [...projectAgents, ...globalAgents];
}
```

- [ ] **Step 4: Run test to verify it passes and commit**

```bash
pnpm vitest run packages/core/tests/list.test.ts
git add packages/core/src/operations/list.ts packages/core/tests/list.test.ts
git commit -m "feat(core): list() merges project and global agents"
```

### Task 4.5: Wire operations into core barrel export

**Files:**

- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Update `index.ts`**

```typescript
export * from './types.js';
export * from './adapter.js';
export * from './store/index.js';
export { FsStore } from './store/fs-store.js';
export { ProjectStore } from './store/project-store.js';
export { GlobalStore } from './store/global-store.js';
export { save } from './operations/save.js';
export { load } from './operations/load.js';
export { list } from './operations/list.js';
export { collectGitContext } from './git.js';
export { VERSION } from './version.js';
```

- [ ] **Step 2: Typecheck, build, commit**

```bash
pnpm --filter @agent-saver/core typecheck
pnpm --filter @agent-saver/core build
git add packages/core/src/index.ts
git commit -m "chore(core): export save/load/list from package root"
```

---

## Phase 5: Claude Code Adapter

### Task 5.1: Path helpers (TDD)

**Files:**

- Create: `packages/adapter-claude-code/src/paths.ts`
- Create: `packages/adapter-claude-code/tests/paths.test.ts`

- [ ] **Step 1: Write the failing test**

CC encodes the cwd as a directory name by replacing `/` with `-` and prefixing with `-`. Verify by inspection: `~/.claude/projects/` listing on the user's machine has dir names like `-Users-sezginkahraman-repos-claude-code-main`.

```typescript
// packages/adapter-claude-code/tests/paths.test.ts
import { describe, it, expect } from 'vitest';
import { encodeCwd, projectSessionsDir } from '../src/paths.js';

describe('encodeCwd', () => {
  it('replaces slashes with dashes and prepends a dash', () => {
    expect(encodeCwd('/Users/x/repos/y')).toBe('-Users-x-repos-y');
  });

  it('handles paths with no trailing slash and no double-slashes', () => {
    expect(encodeCwd('/tmp/abc')).toBe('-tmp-abc');
  });
});

describe('projectSessionsDir', () => {
  it('joins home/.claude/projects with encoded cwd', () => {
    const result = projectSessionsDir('/tmp/foo', '/home/me');
    expect(result).toBe('/home/me/.claude/projects/-tmp-foo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/adapter-claude-code/tests/paths.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `paths.ts`**

```typescript
// packages/adapter-claude-code/src/paths.ts
import { homedir } from 'node:os';
import { join } from 'node:path';

export function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

export function projectSessionsDir(cwd: string, home: string = homedir()): string {
  return join(home, '.claude', 'projects', encodeCwd(cwd));
}
```

- [ ] **Step 4: Run test, commit**

```bash
pnpm vitest run packages/adapter-claude-code/tests/paths.test.ts
git add packages/adapter-claude-code/src/paths.ts packages/adapter-claude-code/tests/paths.test.ts
git commit -m "feat(adapter-cc): encodeCwd and projectSessionsDir helpers"
```

> ⚠️ **VERIFY DURING IMPLEMENTATION:** Confirm CC's actual cwd-encoding rule by listing your real `~/.claude/projects/` directory. Adjust `encodeCwd` if needed before continuing.

### Task 5.2: Session detection (TDD)

**Files:**

- Create: `packages/adapter-claude-code/src/session-detect.ts`
- Create: `packages/adapter-claude-code/tests/session-detect.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/adapter-claude-code/tests/session-detect.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectActiveSession } from '../src/session-detect.js';

describe('detectActiveSession', () => {
  let fakeHome: string;
  let cwd: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), 'home-'));
    cwd = '/tmp/my-project';
  });

  afterEach(() => {
    delete process.env.CLAUDE_SESSION_ID;
  });

  it('returns env var when set', async () => {
    process.env.CLAUDE_SESSION_ID = 'env-session-id';
    const got = await detectActiveSession(cwd, { home: fakeHome });
    expect(got).toBe('env-session-id');
  });

  it('falls back to most recently modified JSONL', async () => {
    const sessionsDir = join(fakeHome, '.claude', 'projects', '-tmp-my-project');
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, 'old.jsonl'), 'a');
    await writeFile(join(sessionsDir, 'new.jsonl'), 'b');

    // Force old's mtime backwards
    const past = new Date(Date.now() - 60_000);
    await utimes(join(sessionsDir, 'old.jsonl'), past, past);

    const got = await detectActiveSession(cwd, { home: fakeHome });
    expect(got).toBe('new');
  });

  it('returns null when no JSONLs exist', async () => {
    const got = await detectActiveSession(cwd, { home: fakeHome });
    expect(got).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/adapter-claude-code/tests/session-detect.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `session-detect.ts`**

```typescript
// packages/adapter-claude-code/src/session-detect.ts
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectSessionsDir } from './paths.js';

export interface DetectOpts {
  home?: string;
  envVarName?: string;
}

export async function detectActiveSession(
  cwd: string,
  opts: DetectOpts = {},
): Promise<string | null> {
  const envName = opts.envVarName ?? 'CLAUDE_SESSION_ID';
  const home = opts.home ?? homedir();
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;

  const dir = projectSessionsDir(cwd, home);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const jsonls = entries.filter((e) => e.endsWith('.jsonl'));
  if (jsonls.length === 0) return null;

  const stats = await Promise.all(
    jsonls.map(async (f) => ({ f, mtime: (await stat(join(dir, f))).mtimeMs })),
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  return stats[0]!.f.replace(/\.jsonl$/, '');
}
```

- [ ] **Step 4: Run test, commit**

```bash
pnpm vitest run packages/adapter-claude-code/tests/session-detect.test.ts
git add packages/adapter-claude-code/src/session-detect.ts packages/adapter-claude-code/tests/session-detect.test.ts
git commit -m "feat(adapter-cc): detectActiveSession with env primary + mtime fallback"
```

### Task 5.3: Transcript I/O (TDD)

**Files:**

- Create: `packages/adapter-claude-code/src/transcript-io.ts`
- Create: `packages/adapter-claude-code/tests/transcript-io.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/adapter-claude-code/tests/transcript-io.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTranscript, writeTranscript } from '../src/transcript-io.js';

describe('transcript I/O', () => {
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), 'home-'));
  });

  it('reads a JSONL transcript by session id', async () => {
    const cwd = '/tmp/proj-r';
    const dir = join(fakeHome, '.claude', 'projects', '-tmp-proj-r');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'abc-123.jsonl'), '{"a":1}\n{"a":2}\n');

    const t = await readTranscript('abc-123', cwd, { home: fakeHome });
    expect(t.raw).toBe('{"a":1}\n{"a":2}\n');
  });

  it('writes a transcript to the encoded project sessions dir', async () => {
    const cwd = '/tmp/proj-w';
    const sessionId = 'new-uuid-1';

    await writeTranscript(
      { raw: '{"x":1}\n' },
      { newSessionId: sessionId, parentSessionId: 'old', targetCwd: cwd },
      { home: fakeHome },
    );

    const written = await readFile(
      join(fakeHome, '.claude', 'projects', '-tmp-proj-w', `${sessionId}.jsonl`),
      'utf8',
    );
    expect(written).toBe('{"x":1}\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/adapter-claude-code/tests/transcript-io.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `transcript-io.ts`**

```typescript
// packages/adapter-claude-code/src/transcript-io.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RawTranscript } from '@agent-saver/core';
import { projectSessionsDir } from './paths.js';

export interface IoOpts {
  home?: string;
}

export async function readTranscript(
  sessionId: string,
  cwd: string,
  opts: IoOpts = {},
): Promise<RawTranscript> {
  const home = opts.home ?? homedir();
  const file = join(projectSessionsDir(cwd, home), `${sessionId}.jsonl`);
  const raw = await readFile(file, 'utf8');
  return { raw };
}

export interface WriteParams {
  newSessionId: string;
  parentSessionId: string;
  targetCwd: string;
}

export async function writeTranscript(
  transcript: RawTranscript,
  params: WriteParams,
  opts: IoOpts = {},
): Promise<void> {
  const home = opts.home ?? homedir();
  const dir = projectSessionsDir(params.targetCwd, home);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${params.newSessionId}.jsonl`);
  await writeFile(file, transcript.raw, 'utf8');
}
```

> **Note:** This task writes the transcript bytes as-is. The actual UUID rewriting happens in [Task 5.5](#task-55-uuid-rewriting-tdd). The adapter's `writeTranscript` in Task 5.7 will compose `rewriteUuids` + `writeTranscript`.

- [ ] **Step 4: Run test, commit**

```bash
pnpm vitest run packages/adapter-claude-code/tests/transcript-io.test.ts
git add packages/adapter-claude-code/src/transcript-io.ts packages/adapter-claude-code/tests/transcript-io.test.ts
git commit -m "feat(adapter-cc): JSONL read/write under project sessions dir"
```

### Task 5.4: Transcript stats (TDD)

**Files:**

- Create: `packages/adapter-claude-code/src/transcript-stats.ts`
- Create: `packages/adapter-claude-code/tests/transcript-stats.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/adapter-claude-code/tests/transcript-stats.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/adapter-claude-code/tests/transcript-stats.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `transcript-stats.ts`**

```typescript
// packages/adapter-claude-code/src/transcript-stats.ts
import type { RawTranscript } from '@agent-saver/core';

const MESSAGE_TYPES = new Set(['user', 'assistant']);
const CHARS_PER_TOKEN = 4;

function* parseLines(transcript: RawTranscript): Generator<Record<string, unknown>> {
  for (const line of transcript.raw.split('\n')) {
    if (!line) continue;
    try {
      yield JSON.parse(line) as Record<string, unknown>;
    } catch {
      // skip malformed lines
    }
  }
}

export function countMessages(transcript: RawTranscript): number {
  let n = 0;
  for (const obj of parseLines(transcript)) {
    if (typeof obj.type === 'string' && MESSAGE_TYPES.has(obj.type)) n++;
  }
  return n;
}

export function estimateTokens(transcript: RawTranscript): number {
  if (!transcript.raw) return 0;
  return Math.ceil(transcript.raw.length / CHARS_PER_TOKEN);
}
```

> **Note:** The token estimate uses the standard char-count heuristic (≈4 chars/token). Good enough for display; not used for billing.

- [ ] **Step 4: Run test, commit**

```bash
pnpm vitest run packages/adapter-claude-code/tests/transcript-stats.test.ts
git add packages/adapter-claude-code/src/transcript-stats.ts packages/adapter-claude-code/tests/transcript-stats.test.ts
git commit -m "feat(adapter-cc): transcript stats — count messages + estimate tokens"
```

### Task 5.5: UUID rewriting (TDD)

**Files:**

- Create: `packages/adapter-claude-code/src/uuid-rewrite.ts`
- Create: `packages/adapter-claude-code/tests/uuid-rewrite.test.ts`
- Create: `packages/adapter-claude-code/tests/fixtures/sample-session.jsonl`

> Before writing this task, copy a small real CC session JSONL into `tests/fixtures/sample-session.jsonl` (sanitized of secrets if needed). 10–20 messages is enough.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/adapter-claude-code/tests/uuid-rewrite.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteUuids } from '../src/uuid-rewrite.js';

const fixturePath = join(__dirname, 'fixtures', 'sample-session.jsonl');

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/adapter-claude-code/tests/uuid-rewrite.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `uuid-rewrite.ts`**

```typescript
// packages/adapter-claude-code/src/uuid-rewrite.ts
import type { RawTranscript } from '@agent-saver/core';

export interface RewriteParams {
  newSessionId: string;
  parentSessionId: string;
}

export function rewriteUuids(transcript: RawTranscript, params: RewriteParams): RawTranscript {
  const lines = transcript.raw.split('\n').filter(Boolean);
  const out: string[] = [];

  lines.forEach((line, idx) => {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      out.push(line);
      return;
    }
    obj.sessionId = params.newSessionId;
    if (idx === 0) {
      obj.parentSessionId = params.parentSessionId;
    }
    out.push(JSON.stringify(obj));
  });

  return { raw: out.join('\n') + '\n' };
}
```

- [ ] **Step 4: Run test, commit**

```bash
pnpm vitest run packages/adapter-claude-code/tests/uuid-rewrite.test.ts
git add packages/adapter-claude-code/src/uuid-rewrite.ts packages/adapter-claude-code/tests/uuid-rewrite.test.ts packages/adapter-claude-code/tests/fixtures/sample-session.jsonl
git commit -m "feat(adapter-cc): rewrite sessionId across transcript, record parent on first"
```

### Task 5.6: Files-touched extraction (TDD)

**Files:**

- Create: `packages/adapter-claude-code/src/files-touched.ts`
- Create: `packages/adapter-claude-code/tests/files-touched.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/adapter-claude-code/tests/files-touched.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/adapter-claude-code/tests/files-touched.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `files-touched.ts`**

```typescript
// packages/adapter-claude-code/src/files-touched.ts
import type { RawTranscript } from '@agent-saver/core';

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit']);

interface ContentBlock {
  type?: string;
  name?: string;
  input?: { file_path?: string };
}

export function extractFilesTouched(transcript: RawTranscript): string[] {
  const seen = new Set<string>();
  for (const line of transcript.raw.split('\n')) {
    if (!line) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const content = (obj as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content as ContentBlock[]) {
      if (block?.type !== 'tool_use') continue;
      if (!block.name || !FILE_TOOLS.has(block.name)) continue;
      const fp = block.input?.file_path;
      if (typeof fp === 'string' && fp.length > 0) seen.add(fp);
    }
  }
  return [...seen];
}
```

- [ ] **Step 4: Run test, commit**

```bash
pnpm vitest run packages/adapter-claude-code/tests/files-touched.test.ts
git add packages/adapter-claude-code/src/files-touched.ts packages/adapter-claude-code/tests/files-touched.test.ts
git commit -m "feat(adapter-cc): extract files referenced by Read/Edit/Write tool_use"
```

### Task 5.7: Resume command builder (TDD)

**Files:**

- Create: `packages/adapter-claude-code/src/resume-cmd.ts`
- Create: `packages/adapter-claude-code/tests/resume-cmd.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/adapter-claude-code/tests/resume-cmd.test.ts
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

  it("escapes single quotes inside path", () => {
    expect(buildResumeCommand('uuid', `/it's`, '/x')).toBe(
      `cd 'it'\\''s' && claude --resume uuid`,
    );
    // Note: leading slash falls into the quoted body; the actual function should preserve it.
  });
});
```

> ⚠️ Re-read the fourth test before implementing — the expected string in this plan demonstrates the escape pattern but does not include the leading `/`. The actual implementation must keep the leading `/`. Adjust the test's expected value to `cd '/it'\\''s' && claude --resume uuid` after writing the function (TDD: drive the right behavior).

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/adapter-claude-code/tests/resume-cmd.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `resume-cmd.ts`**

```typescript
// packages/adapter-claude-code/src/resume-cmd.ts
function shellQuote(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

export function buildResumeCommand(sessionId: string, sourceCwd: string, currentCwd: string): string {
  const base = `claude --resume ${sessionId}`;
  if (sourceCwd === currentCwd) return base;
  return `cd ${shellQuote(sourceCwd)} && ${base}`;
}
```

- [ ] **Step 4: Fix the fourth test's expected string**

Update `tests/resume-cmd.test.ts` 4th test to:

```typescript
it("escapes single quotes inside path", () => {
  expect(buildResumeCommand('uuid', `/it's`, '/x')).toBe(
    `cd '/it'\\''s' && claude --resume uuid`,
  );
});
```

- [ ] **Step 5: Run test, commit**

```bash
pnpm vitest run packages/adapter-claude-code/tests/resume-cmd.test.ts
git add packages/adapter-claude-code/src/resume-cmd.ts packages/adapter-claude-code/tests/resume-cmd.test.ts
git commit -m "feat(adapter-cc): buildResumeCommand with proper shell quoting"
```

### Task 5.8: Compose ClaudeCodeAdapter class

**Files:**

- Create: `packages/adapter-claude-code/src/adapter.ts`
- Modify: `packages/adapter-claude-code/src/index.ts`

- [ ] **Step 1: Implement `adapter.ts`**

```typescript
// packages/adapter-claude-code/src/adapter.ts
import type { RawTranscript, ToolAdapter, WriteOpts } from '@agent-saver/core';
import { detectActiveSession } from './session-detect.js';
import { readTranscript, writeTranscript } from './transcript-io.js';
import { rewriteUuids } from './uuid-rewrite.js';
import { countMessages, estimateTokens } from './transcript-stats.js';
import { extractFilesTouched } from './files-touched.js';
import { buildResumeCommand } from './resume-cmd.js';

export class ClaudeCodeAdapter implements ToolAdapter {
  readonly toolName = 'claude-code';

  async detectActiveSession(cwd: string): Promise<string | null> {
    return detectActiveSession(cwd);
  }

  async readTranscript(sessionId: string, cwd: string): Promise<RawTranscript> {
    return readTranscript(sessionId, cwd);
  }

  async writeTranscript(transcript: RawTranscript, opts: WriteOpts): Promise<string> {
    const rewritten = rewriteUuids(transcript, {
      newSessionId: opts.newSessionId,
      parentSessionId: opts.parentSessionId,
    });
    await writeTranscript(rewritten, opts);
    return opts.newSessionId;
  }

  resumeCommand(sessionId: string, sourceCwd: string, currentCwd: string): string {
    return buildResumeCommand(sessionId, sourceCwd, currentCwd);
  }

  extractFilesTouched(transcript: RawTranscript): string[] {
    return extractFilesTouched(transcript);
  }

  countMessages(transcript: RawTranscript): number {
    return countMessages(transcript);
  }

  estimateTokens(transcript: RawTranscript): number {
    return estimateTokens(transcript);
  }
}
```

- [ ] **Step 2: Export from `index.ts`**

```typescript
// packages/adapter-claude-code/src/index.ts
export { ClaudeCodeAdapter } from './adapter.js';
```

- [ ] **Step 3: Typecheck and build**

```bash
pnpm --filter @agent-saver/adapter-claude-code typecheck
pnpm --filter @agent-saver/adapter-claude-code build
```

- [ ] **Step 4: Commit**

```bash
git add packages/adapter-claude-code/src/adapter.ts packages/adapter-claude-code/src/index.ts
git commit -m "feat(adapter-cc): ClaudeCodeAdapter composes detection + io + rewrite + stats"
```

### Task 5.9: Adapter integration test (round-trip)

**Files:**

- Create: `packages/adapter-claude-code/tests/adapter.integration.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/adapter-claude-code/tests/adapter.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCodeAdapter } from '../src/adapter.js';

const fixturePath = join(__dirname, 'fixtures', 'sample-session.jsonl');

describe('ClaudeCodeAdapter (integration)', () => {
  let fakeHome: string;
  const cwd = '/tmp/agent-saver-int';

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), 'home-'));
    process.env.HOME = fakeHome;
    delete process.env.CLAUDE_SESSION_ID;
    const sessionsDir = join(fakeHome, '.claude', 'projects', '-tmp-agent-saver-int');
    await mkdir(sessionsDir, { recursive: true });
    await copyFile(fixturePath, join(sessionsDir, 'orig-session.jsonl'));
  });

  it('detects, reads, rewrites, and writes a transcript', async () => {
    const adapter = new ClaudeCodeAdapter();
    const sessionId = await adapter.detectActiveSession(cwd);
    expect(sessionId).toBe('orig-session');

    const transcript = await adapter.readTranscript(sessionId!, cwd);
    expect(transcript.raw.length).toBeGreaterThan(0);

    const newId = '00000000-0000-0000-0000-000000000000';
    await adapter.writeTranscript(transcript, {
      newSessionId: newId,
      parentSessionId: sessionId!,
      targetCwd: cwd,
    });

    const writtenPath = join(fakeHome, '.claude', 'projects', '-tmp-agent-saver-int', `${newId}.jsonl`);
    const written = await readFile(writtenPath, 'utf8');
    const firstLine = JSON.parse(written.split('\n')[0]!) as Record<string, unknown>;
    expect(firstLine.sessionId).toBe(newId);
    expect(firstLine.parentSessionId).toBe('orig-session');
  });
});
```

- [ ] **Step 2: Run test**

```bash
pnpm vitest run packages/adapter-claude-code/tests/adapter.integration.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the entire test suite**

```bash
pnpm test
```

Expected: all tests across core and adapter-cc pass.

- [ ] **Step 4: Commit**

```bash
git add packages/adapter-claude-code/tests/adapter.integration.test.ts
git commit -m "test(adapter-cc): integration roundtrip via real fixture"
```

---

## Phase 6: CLI

### Task 6.1: CLI program scaffold

**Files:**

- Create: `packages/cli/src/program.ts`
- Create: `packages/cli/src/format.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Implement `format.ts`**

```typescript
// packages/cli/src/format.ts
import type { AgentRef } from '@agent-saver/core';

export function formatAgentLine(ref: AgentRef): string {
  const desc = ref.metadata.description ? ` — ${ref.metadata.description}` : '';
  return `[${ref.scope}] ${ref.name}  (${ref.metadata.message_count} msgs)${desc}`;
}

export function formatList(refs: AgentRef[]): string {
  if (refs.length === 0) return '(no saved agents)';
  return refs.map(formatAgentLine).join('\n');
}
```

- [ ] **Step 2: Implement `program.ts`**

```typescript
// packages/cli/src/program.ts
import { Command } from 'commander';
import { ClaudeCodeAdapter } from '@agent-saver/adapter-claude-code';
import { save, load, list, VERSION } from '@agent-saver/core';
import { formatList } from './format.js';

export function buildProgram(): Command {
  const program = new Command();
  program.name('agent-saver').version(VERSION).description('Save and reload Claude Code agent sessions.');

  program
    .command('save <name>')
    .option('-d, --description <desc>', 'short human description')
    .option('-g, --global', 'save into ~/.claude/agents instead of project-local')
    .action(async (name: string, opts: { description?: string; global?: boolean }) => {
      const adapter = new ClaudeCodeAdapter();
      const ref = await save(adapter, name, {
        description: opts.description,
        scope: opts.global ? 'global' : 'project',
      });
      console.log(`✓ Saved ${ref.name} (${ref.metadata.message_count} msgs, ~${ref.metadata.estimated_tokens} tokens)`);
    });

  program
    .command('load <name>')
    .option('-g, --global', 'force global scope')
    .action(async (name: string, opts: { global?: boolean }) => {
      const adapter = new ClaudeCodeAdapter();
      const result = await load(adapter, name, { scope: opts.global ? 'global' : 'auto' });
      console.log(`Loaded ${result.agent.name}. Run in a new terminal:\n\n  ${result.resumeCommand}\n`);
    });

  program
    .command('list')
    .option('-s, --scope <scope>', 'project | global | auto', 'auto')
    .action(async (opts: { scope: 'project' | 'global' | 'auto' }) => {
      const refs = await list({ scope: opts.scope });
      console.log(formatList(refs));
    });

  return program;
}
```

- [ ] **Step 3: Update `index.ts`**

```typescript
#!/usr/bin/env node
// packages/cli/src/index.ts
import { buildProgram } from './program.js';

buildProgram().parseAsync(process.argv).catch((err) => {
  console.error('error:', (err as Error).message);
  process.exit(1);
});
```

- [ ] **Step 4: Typecheck and build**

```bash
pnpm --filter @agent-saver/cli typecheck
pnpm --filter @agent-saver/cli build
chmod +x packages/cli/dist/index.js
```

- [ ] **Step 5: Smoke test**

```bash
node packages/cli/dist/index.js --version
```

Expected: prints `0.1.0`.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): commander-based save/load/list commands"
```

### Task 6.2: Clipboard integration

**Files:**

- Modify: `packages/cli/src/program.ts`

- [ ] **Step 1: Update the `load` command to copy the resume command to clipboard**

```typescript
// in program.ts, replace the load action body with:
const adapter = new ClaudeCodeAdapter();
const result = await load(adapter, name, { scope: opts.global ? 'global' : 'auto' });
const { default: clipboardy } = await import('clipboardy');
try {
  await clipboardy.write(result.resumeCommand);
  console.log(`Loaded ${result.agent.name}. Run in a new terminal:\n\n  ${result.resumeCommand}\n\n(copied to clipboard)`);
} catch {
  console.log(`Loaded ${result.agent.name}. Run in a new terminal:\n\n  ${result.resumeCommand}\n\n(clipboard copy failed — paste manually)`);
}
```

- [ ] **Step 2: Build and smoke test**

```bash
pnpm --filter @agent-saver/cli build
```

(Don't smoke-test load yet — depends on saved agents.)

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/program.ts
git commit -m "feat(cli): copy resume command to clipboard on load"
```

### Task 6.3: CLI smoke test (manual, on a real session)

> **Manual verification** — not a unit test. Skip in CI.

- [ ] **Step 1: Link the CLI globally**

```bash
pnpm --filter @agent-saver/cli link --global
which agent-saver
```

Expected: path to the built `index.js`.

- [ ] **Step 2: From inside an active CC session, run save**

```bash
agent-saver save smoke-test --description "MVP smoke"
```

Expected: `✓ Saved smoke-test (N msgs, ~K tokens)`.

- [ ] **Step 3: Verify the on-disk layout**

```bash
ls -la .claude/agents/smoke-test/
cat .claude/agents/smoke-test/metadata.json | head -20
```

Expected: `transcript.jsonl` and `metadata.json` present; metadata contains source_session_id, git_sha, etc.

- [ ] **Step 4: Load**

```bash
agent-saver load smoke-test
```

Expected: prints resume command + "(copied to clipboard)".

- [ ] **Step 5: Paste in a new terminal**

Open a new terminal. Paste. Verify the agent resumes with the prior conversation visible.

- [ ] **Step 6: List**

```bash
agent-saver list
```

Expected: shows smoke-test agent with description.

- [ ] **Step 7: Clean up the smoke test**

```bash
rm -rf .claude/agents/smoke-test
```

No commit (this is manual verification, no changes to repo).

---

## Phase 7: Claude Code Plugin

### Task 7.1: Plugin manifest

**Files:**

- Create: `packages/plugin-claude-code/plugin.json`

- [ ] **Step 1: Write the manifest**

```json
{
  "name": "claude-agent-saver",
  "version": "0.1.0",
  "description": "Save, name, and reload Claude Code sessions.",
  "commands": "./commands",
  "mcpServers": {
    "agent-saver": {
      "command": "node",
      "args": ["./dist/mcp/server.js"]
    }
  }
}
```

> **VERIFY DURING IMPLEMENTATION:** Confirm the exact plugin manifest schema CC expects (the keys `commands`, `mcpServers`, version field name). Inspect another installed plugin under `~/.claude/plugins/cache/` for reference. Adjust this manifest to match before continuing.

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-claude-code/plugin.json
git commit -m "feat(plugin-cc): plugin manifest with mcp server registration"
```

### Task 7.2: MCP server scaffold

**Files:**

- Create: `packages/plugin-claude-code/mcp/server.ts`

- [ ] **Step 1: Implement the server**

```typescript
// packages/plugin-claude-code/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { saveAgentTool, saveAgentHandler } from './tools/save-agent.js';
import { loadAgentTool, loadAgentHandler } from './tools/load-agent.js';
import { listAgentsTool, listAgentsHandler } from './tools/list-agents.js';

const server = new Server(
  { name: 'agent-saver', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [saveAgentTool, loadAgentTool, listAgentsTool],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (name === 'save_agent') return saveAgentHandler(args ?? {});
  if (name === 'load_agent') return loadAgentHandler(args ?? {});
  if (name === 'list_agents') return listAgentsHandler(args ?? {});
  throw new Error(`unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Commit (tools follow in next tasks)**

```bash
git add packages/plugin-claude-code/mcp/server.ts
git commit -m "feat(plugin-cc): MCP server scaffold dispatches to tool handlers"
```

### Task 7.3: save_agent MCP tool

**Files:**

- Create: `packages/plugin-claude-code/mcp/tools/save-agent.ts`

- [ ] **Step 1: Implement the tool**

```typescript
// packages/plugin-claude-code/mcp/tools/save-agent.ts
import { ClaudeCodeAdapter } from '@agent-saver/adapter-claude-code';
import { save } from '@agent-saver/core';

export const saveAgentTool = {
  name: 'save_agent',
  description:
    'Save the current Claude Code session as a named agent. Use when the user says "/save <name>" or asks to snapshot the conversation.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Unique name for the saved agent.' },
      description: { type: 'string', description: 'Optional short description.' },
      global: { type: 'boolean', description: 'Save to global scope instead of project.' },
    },
    required: ['name'],
  },
} as const;

export async function saveAgentHandler(args: Record<string, unknown>) {
  const name = String(args.name);
  const description = typeof args.description === 'string' ? args.description : undefined;
  const scope = args.global === true ? 'global' : 'project';

  const adapter = new ClaudeCodeAdapter();
  const ref = await save(adapter, name, { description, scope });

  const text = `✓ Saved ${ref.name} (${ref.metadata.message_count} msgs, ~${ref.metadata.estimated_tokens} tokens, ${ref.scope} scope)`;
  return { content: [{ type: 'text', text }] };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-claude-code/mcp/tools/save-agent.ts
git commit -m "feat(plugin-cc): save_agent MCP tool"
```

### Task 7.4: load_agent MCP tool

**Files:**

- Create: `packages/plugin-claude-code/mcp/tools/load-agent.ts`

- [ ] **Step 1: Implement the tool**

```typescript
// packages/plugin-claude-code/mcp/tools/load-agent.ts
import { ClaudeCodeAdapter } from '@agent-saver/adapter-claude-code';
import { load } from '@agent-saver/core';

export const loadAgentTool = {
  name: 'load_agent',
  description:
    'Resolve a saved agent and return the shell command to resume it in a new terminal. Use when the user says "/load <name>".',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      global: { type: 'boolean' },
    },
    required: ['name'],
  },
} as const;

export async function loadAgentHandler(args: Record<string, unknown>) {
  const name = String(args.name);
  const scope = args.global === true ? 'global' : 'auto';

  const adapter = new ClaudeCodeAdapter();
  const result = await load(adapter, name, { scope });

  const text = `Loaded ${result.agent.name}. Run in a new terminal:\n\n  ${result.resumeCommand}\n`;
  return { content: [{ type: 'text', text }] };
}
```

> The MCP server cannot reliably write to the user's clipboard from a child process. The slash command markdown will instruct the agent to display this text to the user, who pastes manually. CLI handles clipboard separately.

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-claude-code/mcp/tools/load-agent.ts
git commit -m "feat(plugin-cc): load_agent MCP tool"
```

### Task 7.5: list_agents MCP tool

**Files:**

- Create: `packages/plugin-claude-code/mcp/tools/list-agents.ts`

- [ ] **Step 1: Implement**

```typescript
// packages/plugin-claude-code/mcp/tools/list-agents.ts
import { list } from '@agent-saver/core';

export const listAgentsTool = {
  name: 'list_agents',
  description: 'List all saved agents in the current project and global scope.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['project', 'global', 'auto'] },
    },
  },
} as const;

function ageDays(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d === 0) return 'today';
  if (d === 1) return '1d';
  return `${d}d`;
}

export async function listAgentsHandler(args: Record<string, unknown>) {
  const scope = (args.scope as 'project' | 'global' | 'auto' | undefined) ?? 'auto';
  const refs = await list({ scope });
  if (refs.length === 0) {
    return { content: [{ type: 'text', text: '(no saved agents)' }] };
  }
  const header = '| Name | Scope | Age | Msgs | Description |';
  const sep = '| --- | --- | --- | --- | --- |';
  const rows = refs.map(
    (r) =>
      `| ${r.name} | ${r.scope} | ${ageDays(r.metadata.created_at)} | ${r.metadata.message_count} | ${r.metadata.description ?? ''} |`,
  );
  return { content: [{ type: 'text', text: [header, sep, ...rows].join('\n') }] };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-claude-code/mcp/tools/list-agents.ts
git commit -m "feat(plugin-cc): list_agents MCP tool returning markdown table"
```

### Task 7.6: Slash command markdown files

**Files:**

- Create: `packages/plugin-claude-code/commands/save.md`
- Create: `packages/plugin-claude-code/commands/load.md`
- Create: `packages/plugin-claude-code/commands/agents.md`

- [ ] **Step 1: `commands/save.md`**

```markdown
---
description: Save the current session as a named agent
arguments:
  - name: name
    description: Unique name for the saved agent
  - name: description
    description: Optional short description
    optional: true
---

Call the MCP tool `save_agent` with arguments:

- `name`: $1
- `description`: $2 (if provided)
- `global`: true if the user passes `--global` anywhere in the invocation

Report the tool's response text verbatim to the user.
```

- [ ] **Step 2: `commands/load.md`**

```markdown
---
description: Load a saved agent and print the resume command
arguments:
  - name: name
    description: Name of the saved agent
---

Call the MCP tool `load_agent` with arguments:

- `name`: $1
- `global`: true if the user passes `--global`

Report the tool's response text verbatim. Then remind the user to open a new terminal and paste the printed command.
```

- [ ] **Step 3: `commands/agents.md`**

```markdown
---
description: List saved agents
---

Call the MCP tool `list_agents` with no arguments (or `scope` if the user passes `--project` or `--global`).

Render the returned markdown table verbatim.
```

> **VERIFY DURING IMPLEMENTATION:** Confirm CC's slash-command markdown frontmatter schema (argument names, the `description` field, etc.) by inspecting an existing CC plugin under `~/.claude/plugins/cache/`. Adjust frontmatter if the schema differs.

- [ ] **Step 4: Build the plugin and link it locally**

```bash
pnpm --filter claude-agent-saver build
mkdir -p ~/.claude/plugins/local
ln -snf "$(pwd)/packages/plugin-claude-code" ~/.claude/plugins/local/claude-agent-saver
```

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-claude-code/commands/
git commit -m "feat(plugin-cc): slash command markdown for /save /load /agents"
```

### Task 7.7: Plugin integration smoke test

> **Manual verification** — not a unit test.

- [ ] **Step 1: Restart Claude Code in a project**

Close any running CC session in the target project. Reopen.

- [ ] **Step 2: Run `/save`**

```text
/save plugin-smoke "MVP smoke test"
```

Expected: agent calls the `save_agent` MCP tool, returns `✓ Saved plugin-smoke (...)`.

- [ ] **Step 3: Run `/agents`**

Expected: markdown table listing `plugin-smoke`.

- [ ] **Step 4: Run `/load plugin-smoke`**

Expected: returns the resume command. Open a new terminal, paste, confirm session resumes with full context.

- [ ] **Step 5: Cleanup**

```bash
rm -rf .claude/agents/plugin-smoke
```

---

## Phase 8: End-to-End Verification

### Task 8.1: End-to-end test against the design's success criteria

Walk through each item in [spec §11](../docs/specs/2026-05-13-agent-saver-mvp-design.md#11-success-criteria) and confirm:

- [ ] **Criterion 1**: `/save jacob "auth expert"` writes transcript + metadata to `.claude/agents/jacob/`. Inspect both files. Verify metadata fields match spec.

- [ ] **Criterion 2**: In a fresh CC session, `/load jacob` outputs a resume command. Running it in a new terminal resumes with full conversation visible.

- [ ] **Criterion 3**: `/agents` returns a readable table with project + global agents.

- [ ] **Criterion 4**: `agent-saver save x --global` works from a plain shell. Verify by saving from a fresh terminal where no CC was launched recently (mtime fallback path).

- [ ] **Criterion 5**: A second developer can install the plugin from the repo path (symlink under `~/.claude/plugins/local/`) and use the slash commands.

- [ ] **Criterion 6**: Round-trip integrity — save → load → resume → save-again of a 50+ message session produces a transcript that resumes identically.

If any fail: file an issue in `tasks/issues.md` describing the failure and stop. Do not mark Phase 8 complete with known failures.

### Task 8.2: Update spec with validated open questions

For each of the five open technical questions in [spec §10](../docs/specs/2026-05-13-agent-saver-mvp-design.md#10-open-technical-questions), replace the speculative text with the validated outcome. Commit:

```bash
git add docs/specs/
git commit -m "docs: resolve open technical questions in MVP spec"
```

### Task 8.3: Tag v0.1.0

```bash
git tag -a v0.1.0 -m "agent-saver v0.1.0 — MVP"
```

---

## Self-Review Notes (filled by plan author)

**Spec coverage:**

- Section 2 (use cases A only) → Phases 1–7 collectively implement use case A. ✓
- Section 3 (non-goals) → no tasks for deferred items. ✓
- Section 4 (architecture) → Phase 1.2 creates the four-package structure. ✓
- Section 5 (components) → core (Phases 2–4), adapter (Phase 5), CLI (Phase 6), plugin (Phase 7). ✓
- Section 6 (data model) → Task 2.1 types, Task 3.1 storage layout. ✓
- Section 7 (data flows) → Tasks 4.2/4.3/4.4 implement save/load/list flows; Phase 7 wires them through the plugin. ✓
- Section 8 (K1–K7) → K1 (Tasks 3.2, 4.2, 4.3, 4.4), K2 (Task 5.2), K3 (no pruning), K4 (Task 6.2 clipboard + Task 7.4 print), K5 (Task 1.1 pnpm), K6 (Task 2.2 ToolAdapter), K7 (TUI deferred). ✓
- Section 9 (MVP scope) → matched feature by feature. ✓
- Section 10 (open questions) → Phase 0 spikes validate before implementation. Task 8.2 backfills final outcomes. ✓
- Section 11 (success criteria) → Task 8.1 explicit walkthrough. ✓
- Section 12 (risks) → spike phase catches the high-impact ones (JSONL format, UUID rewrite, env exposure). ✓

**Placeholder check:** No "TBD" / "implement later" / "similar to Task N" / "add appropriate error handling" entries. Code blocks present for every implementation step.

**Type consistency:** `ToolAdapter`, `AgentStore`, `RawTranscript`, `Metadata`, `AgentRef`, `WriteOpts`, `SaveOpts`, `LoadOpts`, `LoadResult` are defined once in Task 2.1–2.3 and re-used by name across tasks. Method names (`detectActiveSession`, `readTranscript`, `writeTranscript`, `resumeCommand`, `extractFilesTouched`, `countMessages`, `estimateTokens`) match between interface (Task 2.2) and implementation (Task 5.8).
