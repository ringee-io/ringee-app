# packages/agent — MCP / agent tool contract rules

Shared schemas, tool catalog, prompts and rules driving Ringee's agent surfaces:
the MCP server (`apps/backend/src/mcp`), the CLI (`apps/agent-cli`), the ChatGPT
app, and the skills under `.claude/skills` / `.agents/skills`.

## The tool catalog is a public contract

`src/tools/catalog.ts` and `src/schemas/*` define what external assistants can
call. Consumers are outside this repo (Claude, ChatGPT, the CLI on users'
machines) and they cache tool definitions.

- Renaming a tool, dropping a parameter or tightening a schema is **breaking**.
  Add, don't mutate.
- Keep `src/rules/index.ts` and the skill files in step with the schemas — the
  safety rules an assistant follows are part of the contract.
- Tests: `pnpm --filter @ringee-io/agent run test`.

## Safety rules encoded here are real

These exist because the tools act on live workspaces:

- Phone numbers are E.164 (`schemas/common.ts` — `E164_REGEX`). Datetimes are
  ISO-8601 with an offset.
- Destructive tools (contact delete, session revoke) require explicit
  double-confirmation; never make one auto-confirmable to smooth a flow.
- Credit-spending actions (lead reveal / import) must be confirmed by a human
  before running.
- Ids come from other tool results. A tool must never accept an id the assistant
  invented.

Do not relax any of these to make an agent flow shorter.

## Server side

The MCP transport, session handling and workspace resolution live in
`apps/backend/src/mcp` and are `@Public()` — the workspace is resolved from the
URL path. Any new tool must resolve and enforce workspace scope server-side; the
schema is not an authorization boundary.
