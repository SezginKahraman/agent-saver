# agent-saver

> Save the golden moment.

Snapshot a live Claude Code session — name it, store it, reload it later in a new terminal exactly where you left off. Built for the moment when your agent has finally "gotten it" but is one compaction away from forgetting.

> **Status: pre-MVP.** Design is locked. Implementation is in progress. Commands described below are the **target UX**, not yet runnable. See [`docs/specs/2026-05-13-agent-saver-mvp-design.md`](docs/specs/2026-05-13-agent-saver-mvp-design.md) for the full spec.

---

## What it does

- `/save jacob` — snapshot the current Claude Code session under the name `jacob`.
- `/load jacob` — print a resume command. Paste it into a new terminal; the agent continues with full context.
- `/agents` — list every saved agent in the current project (and globals).

Saved agents persist across reboots, branches, and weeks. The full conversation — every message, every tool call, every file the agent read — is preserved verbatim.

## Why

Claude Code conversations have a hard ceiling: when context fills up, it compacts. After compaction the agent's deep, project-specific understanding gets summarized away. You can feel the loss the next time you ask a question.

`agent-saver` lets you press save *just before* that happens. Or any time you reach a moment worth keeping.

---

## Installation

The MVP ships two things: a **Claude Code plugin** (slash commands + MCP server) and a **standalone CLI** (`agent-saver`).

### From source (MVP path)

```bash
git clone https://github.com/SezginKahraman/agent-saver.git ~/code/agent-saver
cd ~/code/agent-saver
pnpm install
pnpm build
```

Then link the plugin into Claude Code:

```bash
# CC reads plugins from ~/.claude/plugins/
ln -s ~/code/agent-saver/packages/plugin-claude-code ~/.claude/plugins/agent-saver
```

And link the CLI:

```bash
pnpm --filter @agent-saver/cli link --global
# Now `agent-saver` is on your PATH.
```

Restart Claude Code (or open a new session). The `/save`, `/load`, `/agents` slash commands should appear.

### From the marketplace (future, post-publish)

```bash
# In Claude Code:
/plugin install agent-saver

# CLI:
npm install -g @agent-saver/cli
```

---

## Usage

### Slash commands (inside Claude Code)

| Command                                  | What it does                                                  |
| ---------------------------------------- | ------------------------------------------------------------- |
| `/save <name> [description]`             | Snapshot the current session under `<name>`.                  |
| `/save <name> --global`                  | Save to `~/.claude/agents/` instead of project-scoped.        |
| `/load <name>`                           | Print the resume command and copy it to clipboard.            |
| `/agents`                                | List all saved agents (project + global).                     |

**Example session:**

```text
> we just figured out the whole auth refactor. don't lose this.
/save auth-refactor "post-refactor mental model + decisions"

✓ Saved auth-refactor (142 msgs, ~87K tokens, project scope)

# ... two days later, in a fresh terminal ...

/load auth-refactor

Loaded auth-refactor. Run in a new terminal:

  claude --resume 7b2a-f3d1-...

(copied to clipboard)
```

Paste the command into a new terminal and the agent picks up exactly where you saved it — same files in memory, same decisions made, same conventions established.

### CLI (outside Claude Code)

Useful for Playwright automation, CI workflows, or one-off scripting.

```bash
agent-saver save <name> [--description <desc>] [--global]
agent-saver load <name> [--global]
agent-saver list [--scope project|global|all]
```

The CLI detects the most recent Claude Code session in the current directory by default. Useful pattern:

```bash
# Headless CC run produces a session
claude --print "investigate the failing test" > /dev/null

# Save it for later replay
agent-saver save failing-test-investigation --global
```

---

## What gets saved

When you `/save jacob`, this lands on disk:

```text
<project>/.claude/agents/jacob/
├── transcript.jsonl       # verbatim copy of the CC session
└── metadata.json          # name, description, git SHA, message count,
                           # token estimate, files the agent touched
```

For `--global` saves, the path is `~/.claude/agents/jacob/` instead.

The transcript is a byte-for-byte copy of Claude Code's session JSONL. Nothing is pruned, summarized, or distilled in the MVP — what the agent saw is what gets restored.

## What gets loaded

`/load jacob`:

1. Reads the saved transcript and metadata.
2. Generates a fresh session UUID and writes the transcript into Claude Code's session directory under that UUID.
3. Preserves lineage by setting `parentSessionId` to the original session — you can trace any reloaded agent back to its source.
4. Returns the `claude --resume <uuid>` command (with a `cd` prefix if you're in a different project directory than where it was saved).

The reloaded session is a **fork**, not a continuation of the original — saving a new state at the end of a reloaded session creates a separate snapshot, not a mutation of the parent.

---

## Architecture (brief)

```text
Consumers          → CC plugin / standalone CLI / (future) TUI, VS Code ext
       ↓ depend on
@agent-saver/core  → save / load / list orchestration, storage abstraction
       ↓ uses
ToolAdapter         → @agent-saver/adapter-claude-code (only one for MVP)
                     Future: adapter-codex, adapter-cursor
```

The core library is framework-free TypeScript and knows nothing about Claude Code specifically. CC-format details live in the adapter. Adding Codex support later means writing a new adapter, not modifying core.

See [the design spec](docs/specs/2026-05-13-agent-saver-mvp-design.md) for full architecture, data flows, and technical decisions.

---

## Storage layout

```text
<project>/.claude/agents/        # project-scoped agents (default)
~/.claude/agents/                # global agents (--global flag)
```

Add `.claude/agents/` to your `.gitignore` if you don't want saved agents committed alongside the project. (They contain everything the agent saw, including potentially sensitive file contents.)

---

## Roadmap

**v1.0 (MVP — in progress):**

- Save / load / list via slash commands and CLI
- Project + global storage scopes
- Claude Code adapter
- Standalone CLI

**v1.1:**

- `delete_agent` command
- Auto-checkpoint hook (snapshot on Stop event)
- Transcript pruning (drop failed tool calls, dedupe redundant file reads)

**v2:**

- TUI for managing the registry (`agent-saver ui`)
- VS Code / Cursor extension with sidebar
- `ask_saved_agent` — delegate tasks to a saved agent as a subagent
- Stale-state diff banner — warn when files an agent knew have changed
- Persona generation — auto-summarize a saved session into a lightweight specialist profile
- Codex and Cursor tool adapters

---

## Contributing

The project is in pre-MVP design phase. Watch the repo or open an issue to follow progress. PRs welcome once the initial implementation lands.

## License

TBD — will be set before first public release.
