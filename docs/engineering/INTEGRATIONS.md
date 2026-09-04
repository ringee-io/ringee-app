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
analytics, campaigns, contacts, dnc, leads, pipelines, sessions and AI voice
agents. A renamed or retightened tool schema breaks installed CLIs.

### MCP server (`apps/backend/src/mcp` + `packages/agent`)

Two transports: `/api/mcp/*` (SSE) and `/api/mcp/chatgpt/*`. Tool definitions,
Zod schemas, prompts and agent safety rules live in `@ringee-io/agent`; the
skills under `.claude/skills/` and `.agents/skills/` are generated/installed from
there (`pnpm agent:install-skills`, `pnpm agent:package-skills`).

Authorization is the workspace UUID in the URL — see
[SECURITY.md](SECURITY.md) and `DEBT-005`.

### AI voice agents: list and trigger surfaces

External agent surfaces deliberately expose execution, not configuration.
Creation and editing stay in the authenticated dashboard; no MCP tool, typed
agent-client method or CLI command creates, updates or deletes a voice agent.
Every surface requires an active organization workspace (AGENT-011); personal
workspace requests are rejected before any provider command or billed call.

| Surface            | List                                          | Trigger                                                                                     |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Dashboard REST     | `GET /api/ai-voice-agents?page=1&limit=20`    | `POST /api/ai-voice-agents/:agentId/calls`                                                  |
| Public REST        | `GET /api/v1/ai-voice-agents?page=1&limit=20` | `POST /api/v1/ai-voice-agents/:agentId/calls`                                               |
| MCP                | `list_ai_voice_agents`                        | `start_ai_voice_agent_call`                                                                 |
| `@ringee-io/agent` | `listAiVoiceAgents({ limit })`                | `startAiVoiceAgentCall({ agentId, to, fromNumberId, variables, metadata })`                 |
| CLI                | `ringee voice-agents list`                    | `ringee voice-agents call <agentId> --to +E164 [--from <numberId>] [--var key=value] --yes` |

The public REST routes use the API key issued for a Custom Integration. Send it
as either `X-Ringee-Api-Key: cik_live_…` or
`Authorization: Bearer cik_live_…`; never both. The key resolves the user and
organization from the stored integration, so the request accepts no workspace
identity from the client. Disabled integrations fail with `401`.

Execution-only companion routes are:

- `GET /api/v1/ai-voice-agents/phone-numbers`
- `GET /api/v1/ai-voice-agents/:agentId/calls`
- `GET /api/v1/ai-voice-agents/calls/:callId`

The REST trigger body uses the API's existing snake-case field for caller ID:

```json
{
  "to": "+13055550123",
  "from_number_id": "00000000-0000-4000-8000-000000000000",
  "variables": { "first_name": "Carlos" },
  "metadata": { "external_id": "crm-123" }
}
```

All trigger paths converge on `VoiceAgentCallService.startCall`; none may
reimplement DNC, balance, caller-ID or variable validation. The MCP catalog marks
the trigger as credit-consuming and confirmation-required, and the CLI enforces
that contract with `--yes`. Results are read with
`get_ai_voice_agent_call`, `getAiVoiceAgentCall` or
`ringee voice-agents call-result <callId>`.

### Human support from a live voice-agent call

Every voice-agent blueprint includes `request_human_support`. It is a provider
webhook tool, not an MCP tool: it is used by the speaking agent during a live
conversation when the person explicitly requests a human or another tool fails
and a person must finish the request.

- Endpoint: `POST /api/ai-voice-agents/tools/:agentId/request-human-support`.
- Model-supplied input: only `subject` and `message`.
- Server-derived context: workspace, agent, current call and contact details.
- Authorization: the per-agent secret plus the provider-filled call-control-id
  header (AGENT-003).
- Delivery: email plus push to every resolved organization admin; a personal
  workspace notifies its owner.
- Replay behavior: provider retries are collapsed to one request per call for
  24 hours. If no recipient has a usable delivery channel, the marker is
  released so a later retry can try again.

The tool returns success only after at least one delivery channel is available.
The speaking agent may promise follow-up only after that success, and never
promises a response time.

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

The configuration a provider **stores** — an assistant's tool webhooks, an
insight group's callback — is written at save time and outlives the code and
address it was built from. Before every dial, `ensureToolEndpoints` restores
missing tools and stale URLs while `ensureInsightGroup` re-points the callback.
That is what recovers both an agent created before a new required tool existed
and one whose URLs predate the current address.

## Contract change checklist

| Changing                    | Also check                                                  |
| --------------------------- | ----------------------------------------------------------- |
| A Prisma enum               | frontend labels, MCP schemas, SDK types, `event-spec.ts`    |
| An `/api` response shape    | web, extension, CLI, Attio, ChatGPT app, SDK                |
| An MCP tool schema          | `packages/agent` catalog + tests, CLI commands, skill files |
| An SDK export               | `dist` typings, playground, `package.json` version          |
| A webhook payload           | `event-spec.ts`, the docs tab, live customer endpoints      |
| Auth or ownership behaviour | every non-Clerk identity in [WORKSPACES.md](WORKSPACES.md)  |
