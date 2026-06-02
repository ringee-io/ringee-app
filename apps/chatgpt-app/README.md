# Ringee ChatGPT App (`@ringee-io/chatgpt-app`)

A polished ChatGPT App for Ringee outbound sales. It does **not** contain
business logic — it proxies to the existing Ringee **backend/MCP** (the single
source of truth) and renders the results as rich, Ringee-styled components.

## Architecture

Three clearly separated layers:

```
src/
  components/        UI — the visual components (no network, no business logic)
    cards/           ContactCard · LeadSearchResults · CallSessionCard ·
                     CallbackCard · MeetingCard · CallOutcomeCard
    ui/ atoms/ states/   primitives, status pills, sensitivity badges, states
    registry.tsx     component name → renderer + demo data
  lib/
    openai.ts        Apps SDK bridge (window.openai: toolOutput, callTool, theme…)
    format.ts mock.ts utils.ts
  server/            MCP client / adapter (the only layer that talks to Ringee)
    ringee-mcp.ts    server-only RingeeClient (from @ringee-io/agent)
    mcp-server.ts    MCP server: proxies tools + attaches component templates
    widget-template.ts  skybridge HTML for each component
    serve.ts         standalone MCP HTTP endpoint for ChatGPT connectors
  app/
    page.tsx         component gallery / design preview ( / )
    render/[component]/  the surface ChatGPT embeds per component
```

Data flow:

```
ChatGPT  →  MCP server (serve.ts)  →  RingeeClient  →  Ringee backend/MCP
                  │                                         (source of truth)
                  └── attaches openai/outputTemplate → renders src/components
```

## Run

### 1. Component gallery (design preview, no backend needed)

```bash
pnpm --filter @ringee-io/chatgpt-app dev   # http://localhost:4202
```

Shows every component with sample data, plus loading/empty/error states and the
full capability catalog. Use it to review and iterate on the UI.

### 2. The MCP endpoint (connects ChatGPT to Ringee)

```bash
# Configure the Ringee connection (same as the agent layer / CLI):
export RINGEE_MCP_URL="https://api.ringee.io/api/mcp/<userId>/sse"
# or RINGEE_BACKEND_URL + RINGEE_USER_ID [+ RINGEE_ORG_ID]
export RINGEE_APP_URL="http://localhost:4202"   # where widgets are served

pnpm --filter @ringee-io/chatgpt-app mcp        # http://localhost:4250/mcp
```

Point a ChatGPT connector or the [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
at `http://localhost:4250/mcp`. Tool calls flow straight through to your Ringee
backend; results come back tagged with the component to render.

### 3. Multi-tenant (every customer, user **and** organization)

For a published app where each customer signs in with their own Ringee account,
enable OAuth. The app authenticates the caller and **forwards their bearer
token** to the backend's authenticated MCP endpoint (`/api/mcp/chatgpt/sse`),
which is the single authority that maps the token to a Ringee account.

```bash
export RINGEE_REQUIRE_AUTH="true"
export RINGEE_OAUTH_ISSUER="https://<your-clerk-domain>"      # Clerk issuer
export RINGEE_OAUTH_JWKS_URL="https://<your-clerk-domain>/.well-known/jwks.json"
export RINGEE_OAUTH_AUDIENCE="https://<this-app-host>"        # = RINGEE_PUBLIC_URL
export RINGEE_PUBLIC_URL="https://<this-app-host>"

# The Ringee API origin we forward the token to.
export RINGEE_BACKEND_URL="https://api.ringee.io"
```

How it resolves per request (`src/server/serve.ts`):

1. No bearer token → `401 + WWW-Authenticate`, so ChatGPT runs the OAuth flow.
2. When `RINGEE_OAUTH_JWKS_URL`/`ISSUER` are set, the token is verified locally
   for a clean fast-fail (recommended).
3. `getRingeeClientForToken` opens a client to `/api/mcp/chatgpt/sse` with the
   caller's token as the bearer. No account ids ever live in this proxy.
4. The backend (`McpChatgptController`) verifies the token with Clerk and
   resolves it via `getByClerkId` to the Ringee **user** — or, when the Clerk
   session has an active **organization**, to that organization. Both are
   supported automatically; nothing extra to configure per tenant.

With auth disabled (local dev) the app keeps using the single env-configured
account (`RINGEE_MCP_URL` / `RINGEE_USER_ID`).

> The public, id-in-the-URL `McpController` is left as-is for non-ChatGPT
> clients (e.g. Claude). ChatGPT always goes through the authenticated path.

## How the visual components reach ChatGPT

Each tool result carries `openai/outputTemplate: ui://ringee/<Component>`. The
server registers that template as an HTML resource
(`mimeType: text/html;profile=mcp-app`, see `widget-template.ts`) with the
compiled widget **inlined** — no external asset hosting, no cross-origin.

The widget bundle is built by `scripts/build-widgets.mjs`:

```bash
pnpm --filter @ringee-io/chatgpt-app build:widgets   # → dist/widgets/{widget.js,widget.css}
```

- `widgets/entry.tsx` (esbuild) — one bundle that mounts the right card based on
  the resource's `data-component`, reading data from `window.openai.toolOutput`.
- `src/app/globals.css` (Tailwind CLI) — the compiled styles.

`src/server/mcp-server.ts` reads both at startup and inlines them into every
resource. The same components are also browsable standalone at `/render/<Component>`
and in the gallery at `/`.

### Publishing

See [`PUBLISHING.md`](../../PUBLISHING.md) for the full runbook: build widgets →
enable OAuth (`src/server/auth.ts`) → deploy the MCP server over HTTPS
(`Dockerfile`) → submit via ChatGPT developer mode using `app-metadata.json`.

## Design

Tokens are kept in sync with `apps/frontend` (oklch palette, `--radius: 0.625rem`,
shadcn-style primitives) so the app feels native to Ringee. The visual language
distinguishes **read/write**, **sensitive** (credits / magic links) and
**destructive** (delete / revoke) actions everywhere — see the legend on `/`.
