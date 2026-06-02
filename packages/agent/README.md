# @ringee-io/agent

The **agent layer** for Ringee. A thin, typed interface on top of the existing
Ringee **backend/MCP**, which stays the single source of truth. This package
contains **no business logic** — it only validates input, talks to the MCP, and
shares the operating knowledge (tool catalog, flows, prompts, rules) that every
Ringee agent interface reuses.

```
Ringee backend / MCP   (source of truth — lives in apps/backend)
        │
        ▼
@ringee-io/agent       (this package: clients · schemas · flows · prompts · rules)
        │
        ├── ringee CLI            (apps/agent-cli)
        ├── Claude Skills         (packages/agent/skills)
        ├── slash commands        (packages/agent/commands)
        └── ChatGPT App           (apps/chatgpt-app)
```

## What's inside

| Path | Purpose |
| --- | --- |
| `src/config.ts` | Resolve the MCP connection from env (`RINGEE_MCP_URL`, or `RINGEE_BACKEND_URL` + `RINGEE_USER_ID`). |
| `src/clients/mcp-client.ts` | `RingeeMcpClient` — transport wrapper around the MCP SDK SSE client. |
| `src/clients/ringee-client.ts` | `RingeeClient` — typed facade: one method per capability. |
| `src/schemas/*` | Shared zod input schemas mirroring the MCP tools. |
| `src/types/*` | Typed result shapes the MCP returns. |
| `src/tools/catalog.ts` | Canonical action → MCP tool map + sensitivity (read/write/sensitive/destructive). |
| `src/flows/*` | The outbound flow (prospect → contact → session → outcome → follow-up). |
| `src/rules/*` | Operating guardrails for sensitive/destructive actions. |
| `src/prompts/*` | `buildSystemPrompt()` composed from catalog + flow + rules. |
| `skills/*` | Distributable Claude Skills. |
| `commands/*` | Distributable Claude Code / OpenClaw slash commands. |

## Usage

```ts
import { RingeeClient } from "@ringee-io/agent";

// Reads RINGEE_MCP_URL (or RINGEE_BACKEND_URL + RINGEE_USER_ID [+ RINGEE_ORG_ID])
const ringee = RingeeClient.fromEnv();

const { contacts } = await ringee.searchContacts({ query: "acme" });
const created = await ringee.createContact({
  phoneNumber: "+14155552671",
  name: "Jane Doe",
});

// Sensitive — confirm with the user before calling:
const session = await ringee.createCallSession({
  title: "Tuesday outbound",
  contacts: [{ contactId: created.contact!.id }],
});
console.log(session.joinUrl); // share EXACTLY as returned

await ringee.close();
```

Reuse the operating knowledge anywhere:

```ts
import { buildSystemPrompt, TOOL_CATALOG, PRIMARY_FLOW } from "@ringee-io/agent";
```

## Connection config

Get the values from the dashboard (**Settings → MCP / Integrations**, which calls
`GET /api/mcp/connection-info`) or build them yourself:

```bash
# Preferred: the full SSE URL
export RINGEE_MCP_URL="https://api.ringee.io/api/mcp/<userId>/sse"
# Org-scoped: .../api/mcp/<userId>/<organizationId>/sse

# Or let the layer build it:
export RINGEE_BACKEND_URL="https://api.ringee.io"
export RINGEE_USER_ID="<userId>"
export RINGEE_ORG_ID="<organizationId>"   # optional
```

## Installing the Claude Skills + slash commands

In-repo they are already wired into `.claude/`. To copy them elsewhere:

```bash
pnpm --filter @ringee-io/agent install-skills            # -> ./.claude
node packages/agent/scripts/install-skills.mjs ~/project # -> ~/project/.claude
```

Once published, the intended distribution is `npx skills add ringee-io/ringee-agent`.

## Build

In-repo, consumers import the TypeScript source directly (the CLI bundles it; the
ChatGPT App transpiles it via `transpilePackages`). To emit `dist/` for publishing:

```bash
pnpm --filter @ringee-io/agent build
```
