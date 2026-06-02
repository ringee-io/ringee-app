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

### 3. Multi-tenant (one Ringee account per ChatGPT user)

For a published app where each customer signs in with their own Ringee account,
enable OAuth and let the verified token decide whose data to act on — no single
`RINGEE_USER_ID` baked into the env.

```bash
export RINGEE_REQUIRE_AUTH="true"
export RINGEE_OAUTH_ISSUER="https://<your-clerk-domain>"      # IdP issuer
export RINGEE_OAUTH_JWKS_URL="https://<your-clerk-domain>/.well-known/jwks.json"
export RINGEE_OAUTH_AUDIENCE="https://<this-app-host>"        # = RINGEE_PUBLIC_URL
export RINGEE_PUBLIC_URL="https://<this-app-host>"

# The backend base — the per-user MCP URL is built as
#   <backend>/api/mcp/<userId>[/<orgId>]/sse
export RINGEE_BACKEND_URL="https://api.ringee.io"

# JWT claims that carry the Ringee ids (defaults shown). Configure your IdP to
# emit them — e.g. a Clerk JWT template that maps user metadata → these claims.
export RINGEE_OAUTH_USER_ID_CLAIM="ringee_user_id"
export RINGEE_OAUTH_ORG_ID_CLAIM="ringee_org_id"
```

How it resolves per request (`src/server/serve.ts`):

1. The Bearer JWT is verified against the issuer's JWKS.
2. `resolveRingeeIdentity` reads the `userId` (+ optional `orgId`) claims.
3. `getRingeeClientFor` builds — and caches — a Ringee client scoped to that
   account; the privileged capability URL is constructed server-side and never
   leaves the process.

If a valid token has **no** Ringee identity claim and no env fallback is
configured, the request is rejected with `403` rather than acting as the wrong
account. With auth disabled (local dev) it keeps using the single env account.

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
