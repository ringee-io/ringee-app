# Integrations and consumers

Every surface listed here is a **consumer of Ringee's contracts**. Check the ones
your change touches before altering an API response, a Prisma enum, an MCP tool
schema, an SDK export or a webhook payload.

## Inbound — things that call Ringee

### Dialer SDK (`packages/dialer-sdk`, published)

Embeddable browser SDK loaded from unpkg/jsDelivr by third-party CRMs. Bundles
`@ringee/dialer-core` and `@telnyx/webrtc` via `tsup`.

- Auth: publishable key `pk_live_…` + `Origin` + OTP + live membership re-check.
- Backend: `apps/backend/src/api/sdk/*` (`@Public()` + `SdkSessionGuard`),
  services in `packages/services/src/services/sdk/*`.
- CORS: `sdkCors` is registered **before** the static credentialed CORS in
  `main.ts` so it owns SDK preflights. New origins go on the integration's
  `allowedOrigins`, not in `main.ts`.
- Calls: a `Call` row is created at authorize time (`source: "sdk"`, status
  `pending`) and adopted on `call.initiated` via a signed `X-Ringee-Call-Id`
  custom SIP header — never re-created.
- `apps/sdk-playground` exercises the real published bundle.

**Breaking change surface:** every export in `dist/index.d.ts` and
`dist/ui/index.d.ts`, and every option shape.

### Chrome extension (`apps/browser-extension`)

Click-to-dial and a side panel. `@telnyx/webrtc` is isolated to the offscreen
document by the Vite config. `src/lib/ringee-api.ts` is its API client; it sends
the same device-id header as the web app, which is what makes the
one-call-at-a-time rule treat it as a distinct device. Version lives in its
`package.json` and ships to the Chrome store — old versions stay in the field, so
API changes must be additive.

### CLI (`apps/agent-cli`, published as `ringee`)

Drives the MCP tool surface. Commands mirror the tool catalog: activity,
analytics, campaigns, contacts, dnc, leads, pipelines, sessions. A renamed or
retightened tool schema breaks installed CLIs.

### MCP server (`apps/backend/src/mcp` + `packages/agent`)

Two transports: `/api/mcp/*` (SSE) and `/api/mcp/chatgpt/*`. Tool definitions,
Zod schemas, prompts and agent safety rules live in `@ringee-io/agent`; the
skills under `.claude/skills/` and `.agents/skills/` are generated/installed from
there (`pnpm agent:install-skills`, `pnpm agent:package-skills`).

Authorization is the workspace UUID in the URL — see
[SECURITY.md](SECURITY.md) and `DEBT-005`.

### ChatGPT app (`apps/chatgpt-app`)

OpenAI Apps SDK surface with server-rendered widget cards. Domain verification is
served from `/.well-known/openai-apps-challenge`, excluded from the `/api` prefix
in `main.ts`.

### Attio app (`apps/attio`)

Runs inside Attio's own sandboxed runtime with its own SDK, linter and rules —
see `apps/attio/AGENTS.md`. It is a separate execution environment, not a normal
Node app. Backend counterpart: `attio-app.controller.ts` / `AttioAppService`.

## Outbound — things Ringee calls

### CRM sync (`packages/platform/src/crm`, `packages/services/src/services/crm`)

Provider registry pattern: `provider.ts` + `registry.ts` + `providers/*` for
Attio, HubSpot, Salesforce, Odoo (14–18 and 19+), plus a legacy GoHighLevel kept
for existing records. Syncs contacts, companies, calls, notes, meetings, tasks and
recording uploads through an outbox drained by a Temporal schedule.

Matching uses `normalizePhoneE164` and `phoneMatchesSuffix` from
`packages/platform/src/crm/phone.ts` — the server-side phone helpers.

### Custom Integrations (webhooks)

The generic, customer-facing integration surface.

- **Inbound**: `contact.upserted`, `company.upserted`, `contact.deleted`,
  `company.deleted` — HMAC-verified, validated against the event spec.
- **Outbound**: signed, queued and drained in batches of 25 with a 15s per-request
  timeout, with a delivery log and a failure notifier.
- **Single source of truth for both**:
  `packages/platform/src/custom-integrations/event-spec.ts`. It drives inbound
  validation, outbound payload shape **and** the customer-facing documentation
  tab in the dashboard. Changing it changes public docs and live contracts.
- Envelope: `{ event, eventId, occurredAt, data }`, plus `workspaceId` and
  `integrationId` on outbound.

### Enrichment (`packages/platform/src/enrichment`)

Apollo and Prospeo behind a registry, with waterfall fallback. Billed to the
customer's own provider account, not to Ringee credits (`BILL-017`).

### Other providers

Clerk (auth, orgs, webhooks) · Stripe (payments) · Telnyx (voice, numbers,
messaging, WebRTC) · Deepgram (transcription) · Resend (email) · Firebase (push)
· S3/R2 (storage) · OpenAI / Anthropic (AI pipelines and agents).

### The address providers call Ringee back on

Every URL handed to a provider — an agent's tools, its analysis callback, a call
status callback, a calling application's event webhook — is built as
`${PUBLIC_BACKEND_URL}/api/...`, because `api` is the backend's global prefix.

**`PUBLIC_BACKEND_URL` is an origin and nothing else.** A value carrying a path
(`https://api.example.com/public`) produces URLs the provider dutifully calls
and Ringee answers `404` to — every one of them, at once, reporting the failure
nowhere a person looks. What it looks like from the outside is an agent that
says it is having a technical problem and books nothing, a call with no summary
and no outcome, and no error anywhere. Deployment configuration is responsible
for supplying the bare origin; `apiConfiguration` uses the value unchanged.

The URLs a provider **stores** — an assistant's tool webhooks, an insight
group's callback — are written at save time and outlive the address they were
built from. They are re-pointed before every dial (`ensureInsightGroup`,
`ensureToolEndpoints`), which is the only thing that recovers an agent whose
URLs predate the current address.

## Contract change checklist

| Changing                    | Also check                                                  |
| --------------------------- | ----------------------------------------------------------- |
| A Prisma enum               | frontend labels, MCP schemas, SDK types, `event-spec.ts`    |
| An `/api` response shape    | web, extension, CLI, Attio, ChatGPT app, SDK                |
| An MCP tool schema          | `packages/agent` catalog + tests, CLI commands, skill files |
| An SDK export               | `dist` typings, playground, `package.json` version          |
| A webhook payload           | `event-spec.ts`, the docs tab, live customer endpoints      |
| Auth or ownership behaviour | every non-Clerk identity in [WORKSPACES.md](WORKSPACES.md)  |
