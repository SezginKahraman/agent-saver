# agent-saver

Save, version, and reload Claude Code agent sessions.

> Status: Pre-MVP. Design spec lives in [docs/specs/](docs/specs/).

## What it does

Snapshot an active Claude Code session at any moment — name it, store it, reload it later in a fresh terminal exactly where you left off. The "golden moment" before context compaction, preserved.

## Project layout

This is a pnpm monorepo. Packages and tools will be scaffolded after the implementation plan is approved.

```
packages/
  core/                       # @agent-saver/core — framework-free library
  adapter-claude-code/        # @agent-saver/adapter-claude-code
  cli/                        # @agent-saver/cli — standalone `agent-saver` binary
  plugin-claude-code/         # Claude Code plugin (slash commands + MCP server)
```

## Docs

- [MVP design spec](docs/specs/2026-05-13-agent-saver-mvp-design.md)
- Implementation plan: `tasks/todo.md` (forthcoming)
