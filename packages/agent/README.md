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
        ├── Claude Skills         (packages/agent/skills → /comandos in Claude Code & claude.ai)
        └── ChatGPT App           (apps/chatgpt-app)
```

## What's inside

| Path                           | Purpose                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/config.ts`                | Resolve the MCP connection from env (`RINGEE_MCP_URL`, or `RINGEE_BACKEND_URL` + `RINGEE_USER_ID`). |
| `src/clients/mcp-client.ts`    | `RingeeMcpClient` — transport wrapper around the MCP SDK SSE client.                                |
| `src/clients/ringee-client.ts` | `RingeeClient` — typed facade: one method per capability.                                           |
| `src/schemas/*`                | Shared zod input schemas mirroring the MCP tools.                                                   |
| `src/types/*`                  | Typed result shapes the MCP returns.                                                                |
| `src/tools/catalog.ts`         | Canonical action → MCP tool map + sensitivity (read/write/sensitive/destructive).                   |
| `src/flows/*`                  | The outbound flow (prospect → contact → session → outcome → follow-up).                             |
| `src/rules/*`                  | Operating guardrails for sensitive/destructive actions.                                             |
| `src/prompts/*`                | `buildSystemPrompt()` composed from catalog + flow + rules.                                         |
| `skills/*`                     | Distributable Claude Skills (`/ringee…`) — work in Claude Code AND claude.ai.                       |

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
import {
  buildSystemPrompt,
  TOOL_CATALOG,
  PRIMARY_FLOW,
} from "@ringee-io/agent";
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

## Installing the Claude Skills

The skills (`ringee`, `ringee-prospect`, `ringee-contacts`, `ringee-session`,
`ringee-followup`, `ringee-flow`) create `/ringee…` commands and work in **both**
Claude Code and the **claude.ai** chatbot.

```bash
# Claude Code: copy into a project's .claude/skills
pnpm --filter @ringee-io/agent install-skills            # -> ./.claude/skills
node packages/agent/scripts/install-skills.mjs ~/project # -> ~/project/.claude/skills

# claude.ai: build upload-ready zips (one per skill)
pnpm --filter @ringee-io/agent package-skills            # -> dist/skills/*.zip
```

For claude.ai, upload each zip at Settings → Customize → Skills, and add the
Ringee MCP as a custom Connector. See [`../../PUBLISHING.md`](../../PUBLISHING.md).

## Build

In-repo, consumers import the TypeScript source directly (the CLI bundles it; the
ChatGPT App transpiles it via `transpilePackages`). To emit `dist/` for publishing:

```bash
pnpm --filter @ringee-io/agent build
```
