# Security

Engineering notes. For vulnerability _reporting_, see the repository-root
`SECURITY.md`.

Rules: `AUTH-*`, `HOOK-*`, `WRK-*`, `SESS-*` in
[BUSINESS_RULES.md](BUSINESS_RULES.md).

## Trust boundaries

| Boundary           | Enforced by                                                 |
| ------------------ | ----------------------------------------------------------- |
| Dashboard user     | Clerk session → `ClerkAuthGuard` (global)                   |
| Org role           | `OrgAdminGuard` server-side; the UI mirror is cosmetic      |
| Ringee staff       | `SuperAdminGuard`, verified-email allowlist                 |
| Provider callback  | request signature over the raw body, fail closed            |
| Embedded SDK       | publishable key + `Origin` + OTP + live membership re-check |
| Magic link         | hashed opaque token, uniform failures                       |
| Custom Integration | hashed API key, constant-time compare                       |
| Public API         | Custom Integration API key → stored ownership context       |
| MCP / CLI          | personal API key → its user + their active MCP workspace    |
| MCP connector      | revocable personal API key in the connection URL            |

## `@Public()` is the highest-risk decorator in the codebase

It removes the only authentication on a route. Roughly 50 handlers use it, each
legitimately, in six groups:

1. **Provider webhooks** — Telnyx call/messaging/desk-phone, Stripe, Clerk,
   Custom Integration inbound. Authorization = signature.
2. **SDK endpoints** (`/api/v1/sdk/*`) — authorization = `SdkSessionGuard` +
   origin, applied on top of `@Public()`.
3. **Public API endpoints** (`/api/v1/ai-voice-agents/*`) — authorization =
   `CustomIntegrationApiKeyGuard` over a hashed, active integration key.
4. **Magic-link session endpoints** — authorization = hashed token.
5. **MCP transports** — `/api/mcp` and `/api/mcp/sse` = `PersonalApiKeyGuard`
   over a hashed, unrevoked personal key; `/api/mcp/chatgpt/*` = a verified Clerk
   OAuth token; `/api/mcp/k/:key/*` verifies a personal API key. Legacy
   UUID URLs return 410 and grant no access.
   `ringee login` (`/api/cli/auth/device`, `/token`) is public too: starting a
   login grants nothing, and collecting the key requires the device code only
   the terminal holds (see below).
6. **Genuinely public reads** — rates, available numbers, country requirements,
   `.well-known` challenges, the demo-request form.

Before adding `@Public()`, answer in one sentence what proves the caller is
allowed. If you cannot, do not add it.

The demo-request form is the one public route that can end in an account
(`LIFE-004`). What authorizes that account is not the form, and not the AI
review — it reads text the requester controls and may only refuse — but the
automatic checks: the credentials are emailed to a mailbox at the company's
own live website, so only someone who controls that company's email can use
them.

## Signature verification

- **Telnyx** — Ed25519 over `<timestamp>|<rawBody>`, with
  `TELNYX_WEBHOOK_TOLERANCE_SECONDS` (default 300) replay protection. A missing
  `TELNYX_PUBLIC_KEY` rejects everything: fail closed.
- **Stripe** — `stripeService.validateWebhook(rawBody, signature, secret)`;
  failure returns 400 before any state is touched.
- **Clerk** — raw body registered for `/webhooks/clerk` in `main.ts`.
- **Custom Integrations, outbound** — `Ringee-Signature: t=…,v1=<hex>` over
  `<timestamp>.<body>`; the documented verification recomputes and compares in
  constant time.

Always verify against `req.rawBody`. Re-serializing the parsed body changes the
bytes (`HOOK-002`).

## Tokens and keys

| Secret                 | Shape                                       | At rest                                                 |
| ---------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Integration API key    | `cik_live_<64 hex>`                         | SHA-256 hash; only a `cik_live_<8 hex>` prefix is shown |
| Personal API key       | `ringee_sk_<64 hex>`                        | SHA-256 hash; only a `ringee_sk_<8 hex>` prefix shown   |
| CLI device code        | 32 random bytes, base64url                  | SHA-256 hash only; single use, 10 minutes               |
| Webhook signing secret | `whsec_<64 hex>`                            | encrypted                                               |
| Publishable key        | `pk_live_<payload>.<hmac>`                  | not stored — self-describing and signed                 |
| Magic-link token       | 32 random bytes, base64url                  | SHA-256 hash only                                       |
| SDK correlation        | signed `X-Ringee-Call-Id` custom SIP header | not stored                                              |

The publishable key is deliberately **not** a secret; it is meant to sit in
browser source. Its safety comes from being Ringee-signed (claims cannot be
tampered with) plus server-side origin, OTP and membership checks — and it is
revoked by rotating the integration's secret key, because the signed
`apiKeyPrefix` is compared to the current one on every verify.

Compare secrets with `timingSafeEqual`. Store hashes. Never log a token, a
credential, or a recording URL with its signature.

## Encryption at rest

Private call recordings are encrypted with a per-workspace key: the
organization's key for an org call, otherwise the user's (`CryptoService`,
`APP_ENCRYPTION_SECRET`). A public mp3 copy is kept separately for playback.

## Proxy and abuse

`TRUST_PROXY_HOPS` must state the exact number of trusted proxy hops before
`req.ip` is used. Trusting arbitrary forwarded headers would let an attacker
rotate a spoofed IP past the Stripe abuse limiter
(`StripeAbuseProtectionService`).

An abuse limit counts a request by `clientIp` (`apps/backend/src/api/client-ip.ts`):
Railway's `X-Real-IP` when the API runs there, `req.ip` otherwise. Behind a
proxy nobody declared, `req.ip` is the proxy, so a limit keyed on it puts every
client in one bucket. The Stripe limiter and the public SSE limiter
(`SseRateLimitGuard`) share it; a new limiter does too.

## Proofs that are not a session

Some requests cannot carry the Clerk session, so each carries its own proof.
Reuse these instead of inventing another:

| Need                                  | Proof                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Who pays for a browser WebRTC leg     | `X-Ringee-Dial-Token` (`telephony/dial-authorization.ts`): signed by the dialer's pre-flight for the user, workspace, destination and caller ID. `call.initiated` attributes by it; legs without it are always refused.                                                                                |
| Opening an SSE stream (`EventSource`) | A one-minute ticket (`auth/sse-ticket.ts`) from an authenticated `…/stream-ticket` / `…/events-ticket` route; the stream re-checks access while open. A malformed ticket is refused before any key work (keys are derived once per process, `deriveSdkKey`), and opens are limited per client address. |
| An OAuth callback (calendar, CRM)     | A single-use server-side state plus an HttpOnly cookie set on the response that started the round-trip — the callback must come from that browser. The calendar cookie holds the state's hash, never the state.                                                                                        |
| A carrier media stream                | An HMAC of the call and transcription in the stream URL (`mediaStreamToken`). The URL is never logged or stored, and a carrier error about it keeps only its codes: Telnyx echoes rejected values.                                                                                                     |
| Magic-link session legs               | The item `startCallForItem` admitted: `calling`, unlinked, same destination, session `ready`/`active` — and a caller ID the session's workspace owns, since the browser chooses `from` too.                                                                                                            |

A user/organization id, a call or session id, or a conversation id is an
identifier, never a credential: teammates see them, and keep them after they
leave.

## Requests to addresses a customer chose

Websites read for a profile or a knowledge base, a customer's Odoo server and
Custom Integration webhooks all go through `net/public-network.ts`
(`requestPublic`): the socket's own resolver refuses reserved addresses (so DNS
cannot answer differently for the check and the connection), IPv6 is compared
numerically (mapped, NAT64 and 6to4 forms included), redirects are not followed,
and the decoded body is capped — 1 MB unless the caller sets its own limit, so a
small compressed reply cannot expand on the heap. A page is read with
`readPageText`, which cuts it off at that budget instead of failing it.
`OUTBOUND_ALLOW_PRIVATE_NETWORK` lifts the
private-address refusal for local development or a single-tenant deployment.

CodeQL's `js/request-forgery` cannot see this boundary: the query has no
barrier guards, and the check runs in the socket's resolver, not in the data
flow. It therefore reports the request inside `requestPublic` itself, which is
a false positive by construction and is dismissed as one. The same alert on any
other outbound request is real: route that request through `requestPublic`.

## Known security-relevant observations

Recorded here as facts. See [ARCHITECTURE_DEBT.md](ARCHITECTURE_DEBT.md) for the
full register.

**Fixed:**

- The TriggerLoop webhook guard had its body commented out, leaving
  `POST /api/internal/triggerloop/webhook` unauthenticated behind `@Public()`
  while it dispatched actions that send email, push notifications and create
  tasks. The constant-time secret check is restored and fails closed
  (`DEBT-019`). **`TRIGGERLOOP_WEBHOOK_SECRET` must be set** where TriggerLoop
  runs, or that endpoint returns 401.
- An unused `AuthGuard` verified JWTs with a hard-coded `"secretKey"`. Deleted
  (`DEBT-003`).
- The super-admin allowlist was hard-coded in two places that had already
  drifted, and the committed default made the upstream maintainers super-admins
  of every self-hosted deployment. `BACKOFFICE_SUPER_ADMIN_EMAILS` is now the
  only source, with no fallback — unset means nobody has access (`DEBT-008`).
  **It must be set** in any environment that needs the backoffice.
- Every credit debit now writes a `CreditDebit` row; four paths previously moved
  a balance with no ledger entry and no replay protection (`DEBT-006`).

**Retired compatibility paths:**

- UUID-based MCP URLs always return 410. Use `/api/mcp` with a personal API
  key or create `/api/mcp/k/<key>/sse` under Integrations → Connectors. The old
  `MCP_LEGACY_UUID_URLS` environment variable cannot re-enable UUID auth.
- Ordinary outbound browser calls require the pre-flight's signed
  `X-Ringee-Dial-Token`. `X-User-Id` and `X-Organization-Id` are not proof,
  including when they are absent. The old `TELEPHONY_REQUIRE_DIAL_TOKEN`
  switch cannot disable enforcement. SDK, call-session and server-originated
  legs retain their own checked admission paths. Destinations and caller IDs
  match the complete international number, never a national suffix.
- Attio tokens must be typed and match the active issuance record. Old tokens
  must be regenerated; missing revocation state fails closed. This registry
  is authorization state, not the optional Clerk authentication cache
  (see the deliberate LIFE-002 distinction).

**Deployment coordination:** update web, extension, campaign and other browser
clients before enabling the new API; older tabs/mobile clients without signed
pre-flight authorization will be refused. Replace existing UUID MCP connector
URLs and regenerate legacy Attio tokens. Do not restore these bypasses to make
an old client work.

The separate shared WebRTC credential removal (F-081 / DEBT-020) is deferred
until the production DID routing migration to per-user Call Control endpoints
is confirmed. It is not fixed by dial-token enforcement; credentials already
shipped to browsers still require provider-side rotation after migration.

## Agent API keys and CLI login

**Personal API keys** (`PersonalApiKeyService`) authenticate the MCP endpoint
(`POST /api/mcp`, Streamable HTTP, stateless; `GET /api/mcp/sse` for SSE-only
clients) and the CLI. A key identifies a **user**, not a workspace: every request
re-resolves the user's active MCP workspace (`getActiveWorkspaceOrgId`, which
re-checks membership) — the same rule as the ChatGPT OAuth connector, so
`switch_workspace` works and a removed member falls back to personal. A key is
rejected when unknown, revoked, or when the user is blocked (`WRK-007`).

**`ringee login`** (`CliAuthService`) follows the OAuth 2.0 device authorization
grant (RFC 8628) rather than a localhost redirect, so it also works over SSH and
in containers:

1. `POST /api/cli/auth/device` (public, rate limited per IP) creates a request
   and returns a secret device code (stored hashed) and an 8-letter user code
   from a vowel-free alphabet.
2. The browser page `/cli/authorize?code=…` (Clerk session) shows the terminal's
   hostname, OS, CLI version, IP and age next to the code, and requires an
   explicit **Authorize** — RFC 8628 §5.4's defence against a phished code. The
   CLI prints the code before opening the browser so the user can compare.
3. `POST /api/cli/auth/token` with the device code mints the key **once**: the
   `approved → consumed` transition and the key insert share one transaction,
   so concurrent polls cannot mint two keys. No plaintext key is ever stored.

Every status change is a compare-and-set on `CliAuthRequest.status`, codes
expire after 10 minutes, and an approved request must be collected within 10
minutes of approval. The CLI stores the key in `~/.config/ringee/credentials.json`
(mode `0600`), written as a fresh file renamed into place so it never follows a
symlink, and refuses a config directory that is a symlink, another user's, or
writable by others. `ringee logout` revokes the key server-side, and a re-login
revokes the one it replaces.

**Usage telemetry.** `McpUsageService` appends one `McpUsageEvent` per MCP
`initialize` and per tool call (surface `cli`/`mcp`, auth method, client name
from `clientInfo`, tool, success, duration) — never arguments or results.
Recording is fire-and-forget and can never fail a tool call. Events are kept
for a year (daily `ringee.mcp-usage-prune` schedule). The backoffice reads them
at `/backoffice/agents`.

## Automated security analysis

`.github/workflows/codeql.yml` runs GitHub CodeQL against the repository's
TypeScript/JavaScript and GitHub Actions workflows on pull requests to `main`,
pushes to `main`, a weekly schedule and manual dispatch. It uses build mode
`none`: the scan does not install dependencies, execute repository code or need
provider credentials.

CodeQL is deliberately separate from `.github/workflows/ci.yml`. The functional
CI installs dependencies and runs repository-controlled commands with a
read-only token; only the CodeQL job receives `security-events: write`, which it
needs to publish findings to GitHub code scanning. Its other permissions are
read-only.

## Secure coding standards

A CodeRabbit review of the whole repository (2026-10-30) reported 125
vulnerabilities. Almost all of them were a handful of mistakes repeated surface
after surface; these rules exist so they are not written again. They hold for
every entry point alike: REST controllers, MCP tools, the ChatGPT app, the Attio
and HubSpot apps, SSE and WebSocket streams, webhooks, Temporal activities,
AI-agent tools, the backoffice and one-off scripts.

### Identifiers are not authorization

1. **Resolve every id inside the caller's workspace.** An id from a path, body,
   query, header, `client_state`, MCP argument or LLM tool call is chosen by
   whoever sent it. Load it with a scoped finder (`findByIdForOwner(ctx, id)`,
   `buildOwnershipFilter(ctx)`) and answer a foreign id exactly like a missing
   one. Contacts, tags, DNC entries, numbers, CRM syncs, enrichment jobs,
   recordings and Stripe payment intents were all read or changed by id alone.
2. **Bind a child to its authorized parent.** When a route names a parent and a
   child — campaign and list, call and recording, contact and note, campaign and
   retry rule, session and item — look the child up with both ids
   (`where: { id: recordingId, callId: call.id }`). Authorizing the parent says
   nothing about an unrelated child: a recording id stopped another workspace's
   recording, and a note id deleted another contact's note.
3. **Authorize every id you link or store.** A relation (`connect`, a foreign
   key, `tagIds`, `contactIds`, `assignedUserId`) is checked like the main
   resource before the write; otherwise the caller's own meeting, callback or
   thread exposes the foreign row. Ids an AI tool receives from the model are
   untrusted input too.
4. **Personal scope is `userId` and `organizationId: null`.** Written by hand,
   that is `row.organizationId === ctx.organizationId` in an organization and
   `row.userId === ctx.userId && row.organizationId === null` in a personal
   workspace. `row.userId === ctx.userId` alone let former members keep using an
   organization's threads, meetings, numbers and jobs from their personal
   workspace.
5. **Inside an organization, a member reaches their own work only.** A
   teammate's calls, transcripts, recordings, dialer sessions and pending
   actions are for admins: apply `resolveMemberFilter(user)` (services take it
   as `memberUserId`), and require the campaign assignment of a non-admin
   (`getCampaignById(ctx, id, { requireMembershipForUserId })`). Every surface
   applies the same rule — MCP `list_calls` and Attio tokens once skipped it.

### Identity, proof and freshness

6. **Identity comes from the auth layer or from a token this server signed.**
   Never from `X-User-Id`/`X-Organization-Id`, a URL segment, `client_state` or
   a body field. When a request cannot carry a session, reuse one of the
   [proofs that are not a session](#proofs-that-are-not-a-session). A new proof
   is signed, short-lived, single-purpose — its verifier checks the purpose: the
   Attio verifier once accepted call-session tokens — and bound to everything it
   authorizes: user, workspace, destination, caller ID.
7. **Re-check authority when acting, not only when granting.** Membership, role,
   a block, phone verification, campaign or session status and expiry all change
   after a session, token, stream or lease was issued. Read them again before
   each privileged step; a long-lived stream re-checks while it is open; a
   revocation (regenerated token, removed member, pause, shorter expiry) reaches
   credentials issued before it. Admit an explicit list of states (`ready`,
   `active`), never "anything not closed". A provider fact kept locally is kept
   in sync (Clerk `organizationMembership.updated`) or read live.
8. **A policy guards every path to its side effect.** A feature switch,
   caller-ID eligibility, the recording policy, DNC, a dry-run flag, the scope
   of an approval: the check lives in the service method that performs the side
   effect, so a re-activation, a retry, a second surface or an AI executor
   cannot go around it.

### Data in and out

9. **Never hand a request object to Prisma.** Build `data` from named fields
   (`pickCampaignSettings`, the auto-reload patch in `CreditService`). A body
   passed as `data` carries nested relation writes and server-owned columns: a
   balance, a Stripe id, an owner.
10. **Return a view, not a row.** Never `include: { user: true }` (or a whole
    `Organization`) in anything a client receives — `User.encryptionKey`
    reached organization admins that way. Select the display fields, strip
    credentials (`toCalendarIntegrationView`), return what the consumer needs.
11. **Escape where the text lands.** HTML-escape user text before adding `<br>`
    or links to an email, build an `href` only from a parsed `http(s)` URL, and
    never put a stored value into CSS or `dangerouslySetInnerHTML` unescaped
    (chart keys came from disposition codes).
12. **Bound the work an attacker can size.** Cap a length before parsing it;
    no regular expression with overlapping repetition on untrusted text — scan
    it in linear time; cap decoded bodies (`maxBodyBytes`, `readPageText`),
    column counts and batch sizes; no quadratic loop over input.

### Outbound requests, redirects and navigation

13. **A URL a customer chose goes through `requestPublic`**, never `fetch()` —
    see [requests to addresses a customer chose](#requests-to-addresses-a-customer-chose).
    A redirect is followed only after its target passes the same check.
14. **Redirect only to Ringee's own frontend.** Build return URLs from
    configuration; a client-supplied origin or path passes
    `trustedFrontendOrigin` (`auth/frontend-origin.ts`) or a relative-path check
    such as `safeReturnUrl` first.
15. **Bind an OAuth round-trip to the browser that started it:** a single-use,
    server-side state plus an HttpOnly cookie holding its hash, consumed before
    the code is exchanged.
16. **Navigation and synthetic input cause nothing.** A page opened from a link
    never dials, creates or sends on load — the user clicks first. The
    extension acts only on `event.isTrusted` input.

### Concurrency and money

17. **Check-and-act is one atomic step.** Attempt counters, caps, single-use
    consumption, call leases and start/stop toggles race when they are read and
    written apart. Use `RedisService.compareAndSwap`, a conditional update whose
    count is checked, `SELECT … FOR UPDATE` inside a transaction, or a
    per-resource lease lock.
18. **Money follows what the provider settled.** Credit a Checkout only when it
    is `paid` (and on `checkout.session.async_payment_succeeded`), for the
    amount on the immutable session or invoice, never a subscription setting
    the customer can still change. A new provider cost is a new debit
    (`incurredCostDebitRef`); a resend is a new billed attempt. A Stripe
    restriction that cannot be enforced atomically (first purchase, redemption
    limits) is refused, not approximated. See [BILLING.md](BILLING.md).

### Secrets and operations

19. **Provider credentials never reach a client.** Nothing secret goes in
    `NEXT_PUBLIC_*`, `PLASMO_PUBLIC_*` or a test fixture; mint short-lived
    credentials on the server. A credential that shipped must be rotated —
    deleting it from the code does not take it back.
20. **Logs and emails carry no secrets.** Log an error's kind or code, not its
    message: Prisma and providers echo ids, tokens and rejected values. A
    password goes to its owner only.
21. **No unauthenticated mode beyond loopback**, and a CI publish step trusts
    nothing the build produced: it validates the manifest and fixes the
    registry and proxy itself.
22. **Scripts and the backoffice respect workspaces.** A recovery script links
    only within its own tenant; a resource moved to another owner drops the
    previous owner's data (requirement values, routes, links).
23. **A client address comes from `clientIp`** (`apps/backend/src/api/client-ip.ts`),
    never from the leftmost `X-Forwarded-For`.

## Checklist before merging anything security-adjacent

- Does any new route need `@Public()`? What proves the caller?
- Is a workspace resource loaded by id and then checked against the caller?
- Is a child id checked against its parent, and every id a write links checked
  against the workspace?
- Does a personal-scope check require `organizationId: null`? Does a member see
  only their own work on this surface too?
- Is a client-supplied id used as an authorization claim anywhere?
- Is a request object passed as Prisma `data`, or a whole `user` returned?
- Can a concurrent request slip between a check and the write that follows it?
- Does it fetch a customer-chosen URL without `requestPublic`, or redirect to an
  origin that does not come from configuration?
- Is a secret compared with `===` instead of `timingSafeEqual`?
- Does a failure path log a token, a key, a signed URL or a raw error message?
- Does a new provider callback verify its signature against the raw body?
