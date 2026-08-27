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
| MCP connector      | the workspace UUID in the URL — a capability URL            |

## `@Public()` is the highest-risk decorator in the codebase

It removes the only authentication on a route. Roughly 50 handlers use it, each
legitimately, in five groups:

1. **Provider webhooks** — Telnyx call/messaging/desk-phone, Stripe, Clerk,
   Custom Integration inbound. Authorization = signature.
2. **SDK endpoints** (`/api/v1/sdk/*`) — authorization = `SdkSessionGuard` +
   origin, applied on top of `@Public()`.
3. **Magic-link session endpoints** — authorization = hashed token.
4. **MCP / ChatGPT app transports** — authorization = the URL itself.
5. **Genuinely public reads** — rates, available numbers, country requirements,
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

- **MCP transport authorization is a capability URL.** `/api/mcp/:id/sse` is
  `@Public()` and resolves the workspace from the UUID in the path — knowing a
  workspace UUID is sufficient to drive the tool surface. This is intentional:
  the connector URL is the credential, as with a Slack or Stripe webhook URL.
  The consequence to hold onto is that **workspace UUIDs are secrets** — do not
  log them, put them in error messages, or leak them to third parties. A signed,
  revocable connector token is the upgrade path if MCP links are ever shared
  beyond one operator per workspace.

## Checklist before merging anything security-adjacent

- Does any new route need `@Public()`? What proves the caller?
- Is a workspace resource loaded by id and then checked against the caller?
- Is a client-supplied id used as an authorization claim anywhere?
- Is a secret compared with `===` instead of `timingSafeEqual`?
- Does a failure path log a token, a key, or a signed URL?
- Does a new provider callback verify its signature against the raw body?
