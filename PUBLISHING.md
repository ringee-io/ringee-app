# Publishing the Ringee agent layer

Two distribution targets:

1. **Claude Code plugin** → the Ringee plugin marketplace (this repo).
2. **ChatGPT App** → the Apps SDK MCP server (deployed + submitted to OpenAI).

Both sit on top of the existing Ringee backend/MCP — no business logic is duplicated.

---

## 1. Claude Code plugin (public marketplace)

The marketplace is **this repo**. Two manifests make it work (both validated with
`claude plugin validate`):

- `/.claude-plugin/marketplace.json` — the catalog (marketplace name `ringee-io`,
  one plugin `ringee` sourced from `./packages/agent`).
- `packages/agent/.claude-plugin/plugin.json` — the plugin manifest. It ships the
  `skills/` and `commands/` already in that package and declares the Ringee MCP via
  `packages/agent/.mcp.json`.

The plugin connects to Ringee over MCP. On install Claude Code prompts the user
for their **Ringee MCP URL** (`userConfig.mcp_url`, stored in the keychain) and
wires it into the `ringee` MCP server (`${user_config.mcp_url}`).

### Publish

```bash
# 1. Validate locally
claude plugin validate ./packages/agent
claude plugin validate .          # validates the marketplace

# 2. Commit and push to the PUBLIC repo (github.com/ringee-io/ringee-app)
git add .claude-plugin packages/agent/.claude-plugin packages/agent/.mcp.json
git commit -m "feat: Ringee Claude Code plugin + marketplace"
git push
```

That's it — there is no central submission. A public git repo *is* the marketplace.

### How users install it

```text
/plugin marketplace add ringee-io/ringee-app
/plugin install ringee@ringee-io
```

On enable they paste their Ringee MCP URL (from the dashboard:
Settings → MCP / Integrations → `GET /api/mcp/connection-info`). Then
`/ringee-prospect`, `/ringee-contacts`, `/ringee-session`, `/ringee-followup`
and `/ringee-flow` are available, backed by the `ringee` MCP tools.

### Versioning

Bump `version` in both `plugin.json` and the marketplace entry; users get updates
with `/plugin marketplace update`.

### Optional: list it in Anthropic's discovery

Anthropic curates a discoverable set in the `/plugin` Discover tab. To be
considered, open your marketplace publicly and submit it through Anthropic's
plugin submission form / community process (see code.claude.com/docs → Discover
and install plugins). The decentralized `add ringee-io/ringee-app` route works
immediately regardless.

---

## 2. ChatGPT App (Apps SDK)

The app **is** an MCP server (`apps/chatgpt-app/src/server`) that proxies the
Ringee tools and renders them as visual components. The components are compiled to
a widget bundle and **inlined** into each tool's HTML resource
(`text/html;profile=mcp-app`), so the MCP server is the only thing you deploy.

### Build the widgets

```bash
pnpm --filter @ringee-io/chatgpt-app build:widgets   # → dist/widgets/{widget.js,widget.css}
```

### Run locally & test

```bash
cp apps/chatgpt-app/.env.example apps/chatgpt-app/.env   # set RINGEE_MCP_URL
pnpm --filter @ringee-io/chatgpt-app mcp:prod            # builds widgets + serves :4250/mcp
```

Test with the MCP Inspector (`npx @modelcontextprotocol/inspector`) pointed at
`http://localhost:4250/mcp`, or expose it with `ngrok http 4250` and add it as a
connector in ChatGPT (Settings → Connectors / Developer mode).

### Add authentication (required for a public app)

ChatGPT requires OAuth 2.1 for connectors that touch user data. The protocol
surface is wired (`src/server/auth.ts`, `serve.ts`): `.well-known/oauth-protected-resource`,
the `401 + WWW-Authenticate` challenge, and JWKS token verification. To enable:

```bash
pnpm --filter @ringee-io/chatgpt-app add jose   # signature verification
# .env:
RINGEE_REQUIRE_AUTH=true
RINGEE_PUBLIC_URL=https://app.ringee.io
RINGEE_OAUTH_ISSUER=https://auth.ringee.io
RINGEE_OAUTH_JWKS_URL=https://auth.ringee.io/.well-known/jwks.json
RINGEE_OAUTH_AUDIENCE=https://app.ringee.io/mcp
```

Use Clerk (already Ringee's IdP) or any OAuth 2.1 server that supports PKCE and
publishes JWKS + authorization-server metadata.

### Deploy (HTTPS)

```bash
docker build -f apps/chatgpt-app/Dockerfile -t ringee-chatgpt-mcp .
docker run -p 4250:4250 --env-file apps/chatgpt-app/.env ringee-chatgpt-mcp
```

Put it behind HTTPS (Fly.io / Render / Railway / your own ingress). The connector
URL is `https://<host>/mcp`. (`apps/chatgpt-app/vercel.json` optionally deploys the
component *gallery* for design review — not needed for the app itself.)

### Submit to OpenAI

1. In ChatGPT **developer mode**, create an app and point it at your MCP URL.
2. Fill the listing from `apps/chatgpt-app/app-metadata.json` (name, descriptions,
   categories, icon, privacy/terms URLs, support email — replace the `TODO`s).
3. Verify each tool renders its component and that sensitive/destructive actions
   prompt for confirmation.
4. Submit for review against OpenAI's app developer guidelines
   (developers.openai.com/apps-sdk → guidelines & submission). Approval is
   required before it's public in the ChatGPT app directory.
