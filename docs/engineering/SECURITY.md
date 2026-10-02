# Security

Engineering notes. For vulnerability _reporting_, see the repository-root
`SECURITY.md`.

Rules: `AUTH-*`, `HOOK-*`, `WRK-*`, `SESS-*` in
[BUSINESS_RULES.md](BUSINESS_RULES.md).

## Trust boundaries

| Boundary            | Enforced by                                                 |
| ------------------- | ----------------------------------------------------------- |
| Dashboard user      | Clerk session → `ClerkAuthGuard` (global)                   |
| Org role            | `OrgAdminGuard` server-side; the UI mirror is cosmetic      |
| Ringee staff        | `SuperAdminGuard`, verified-email allowlist                 |
| Provider callback   | request signature over the raw body, fail closed            |
| Embedded SDK        | publishable key + `Origin` + OTP + live membership re-check |
| Magic link          | hashed opaque token, uniform failures                       |
| Custom Integration  | hashed API key, constant-time compare                       |
| Public API          | Custom Integration API key → stored ownership context       |
| MCP / CLI           | personal API key → its user + their active MCP workspace    |
| MCP connector (old) | the workspace UUID in the URL — a capability URL            |

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
   OAuth token; the legacy `/api/mcp/:id/sse` = the URL itself.
   `ringee login` (`/api/cli/auth/device`, `/token`) is public too: starting a
   login grants nothing, and collecting the key requires the device code only
   the terminal holds (see below).
6. **Genuinely public reads** — rates, available numbers, country requirements,
   `.well-known` challenges, the demo-request form.

Before adding `@Public()`, answer in one sentence what proves the caller is
allowed. If you cannot, do not add it.

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

**Accepted, by decision:**

- **The legacy MCP transport authorization is a capability URL.**
  `/api/mcp/:id/sse` is `@Public()` and resolves the workspace from the UUID in
  the path — knowing a workspace UUID is sufficient to drive the tool surface.
  It stays for clients that cannot send a header (claude.ai custom connectors,
  the Claude Code plugin's URL field, CLI < 0.3). The consequence to hold onto is
  that **workspace UUIDs are secrets** — do not log them, put them in error
  messages, or leak them to third parties. The revocable replacement is the
  personal API key below; `McpUsageEvent.authMethod = 'url'` measures how much
  traffic still depends on the old URLs.

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

## Checklist before merging anything security-adjacent

- Does any new route need `@Public()`? What proves the caller?
- Is a workspace resource loaded by id and then checked against the caller?
- Is a client-supplied id used as an authorization claim anywhere?
- Is a secret compared with `===` instead of `timingSafeEqual`?
- Does a failure path log a token, a key, or a signed URL?
- Does a new provider callback verify its signature against the raw body?
