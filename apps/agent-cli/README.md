# ringee CLI (`@ringee-io/cli`)

Operate Ringee from the terminal. The CLI is a thin front-end over
[`@ringee-io/agent`](../../packages/agent), which talks to the Ringee
backend/MCP — the single source of truth.

## Configure

```bash
export RINGEE_MCP_URL="https://api.ringee.io/api/mcp/<userId>/sse"
# or:  RINGEE_BACKEND_URL + RINGEE_USER_ID [+ RINGEE_ORG_ID]
```

Get these from the dashboard (Settings → MCP / Integrations →
`GET /api/mcp/connection-info`). Verify with `ringee config check`.

## Run

In-repo (no build needed):

```bash
pnpm ringee contacts search acme          # root convenience script
pnpm --filter @ringee-io/cli dev -- config check
```

Built / global binary:

```bash
pnpm --filter @ringee-io/cli build        # bundles to dist/index.js
node apps/agent-cli/dist/index.js --help  # or `ringee` once linked on PATH
```

## Commands

```
ringee contacts search <query>
ringee contacts get <contactId>
ringee contacts create --phone +E164 [--name ... --email ...]
ringee contacts update <contactId> [--email ...]
ringee contacts delete <contactId> --confirm-phone +E164 --yes   # destructive

ringee leads search [--title ... --country ... --industry ...]   # returns jobId
ringee leads reveal <jobId> <externalId> [--phone] --yes         # sensitive (credits)
ringee leads import <jobId> <externalId...>

ringee sessions create --contact <id> [--title ...] --yes        # sensitive (magic link)
ringee sessions get <callSessionId>
ringee sessions update <callSessionId> [--title ... --expires ...]
ringee sessions revoke <callSessionId> --yes                     # destructive

ringee outcomes log <callId> <outcome> [--note ...]
ringee callbacks create <contactId> <ISO-8601> [--note ...]
ringee meetings schedule <contactId> <ISO-8601> [--title ... --duration ...]

ringee config show | check
ringee tools | flow | prompt          # knowledge helpers (no connection)
```

Add `--json` to any command for raw machine-readable output.

## Safety

Sensitive and destructive actions require explicit flags so the CLI never
spends credits, mints magic links, or deletes data by accident:

- `leads reveal` and `sessions create/update` need `--yes`.
- `sessions revoke` needs `--yes`.
- `contacts delete` needs both `--confirm-phone <storedPhone>` and `--yes`.
