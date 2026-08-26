# CLAUDE.md

@AGENTS.md

`AGENTS.md` is the source of truth for how to work in this repository — the rules
above apply to Claude Code exactly as written. Everything below is Claude-specific
tooling, not additional policy.

## Claude Code specifics

- Directory-scoped `AGENTS.md` files exist under `apps/*` and `packages/*`. Read
  the nearest one before editing files in that tree.
- Deep references live in `docs/engineering/`. Load a document when the task
  reaches its domain — not up front.
- This repo ships MCP tools and skills that operate a **live** Ringee workspace
  (`.claude/skills/*`, `.mcp.json`). Those act on real contacts, calls and
  credits; they are not a test fixture for code changes.
