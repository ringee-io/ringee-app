# Architecture debt

Problems found while auditing the repository. **Nothing here was changed as part
of writing this document** — it is a register, not a work order.

Rules and current behaviour are documented elsewhere. This file is the one place
where *proposed* improvements live, so "what is true" never blurs into "what
should be".

Severity: **Critical** = correctness/security exposure today · **High** = a
recurring source of bugs or a real trap · **Medium** = friction and drift ·
**Low** = tidy-up.

---

## Critical

### DEBT-019 — The TriggerLoop webhook guard is disabled

**Where:** `apps/backend/src/triggerloop/triggerloop-webhook.guard.ts`,
`apps/backend/src/triggerloop/triggerloop.controller.ts`

**What:** `POST /api/internal/triggerloop/webhook` is `@Public()` and protected by
`TriggerLoopWebhookGuard`, whose entire body is commented out:

```ts
canActivate(context: ExecutionContext): boolean {
  // …every check commented out…
  return true;
}
```

The endpoint dispatches `evaluate` and `executeAction` operations, and the action
registry can create tasks, send email, send push notifications and emit internal
events. `TRIGGERLOOP_WEBHOOK_SECRET` is defined in `@ringee/configuration` and
never read.

**Why it matters:** this is an unauthenticated endpoint that triggers side
effects on named subjects — the clearest violation of `AUTH-002` in the codebase.

**Direction:** restore the commented-out constant-time secret comparison, or
remove the route until TriggerLoop is actually wired up. Verify whether it is
exposed in deployed environments before anything else. Left unchanged here
because re-enabling an auth check is a behaviour change that needs the owner's
confirmation, not a documentation side effect.

### DEBT-001 — No inbound provider-event normalization layer

**Where:** `packages/services/src/services/call.service.ts` (`handleTelnyxEvent`,
`TelnyxWebhookEvent` at lines 19, 228, 272, 687, 774), `apps/backend/src/api/routes/call.controller.ts`

**What:** the domain's central call-lifecycle method takes Telnyx's raw webhook
type and switches on Telnyx event names. The provider abstraction is one-way:
outbound commands go through `TelephonyService`, but inbound events bypass it
entirely. The browser side, by contrast, *does* normalize
(`dialer-core/src/engine/state-map.ts`).

**Why it matters:** a second carrier cannot be added without rewriting the call
lifecycle. Provider payload shape changes reach business logic directly.

**Direction:** introduce a `TelephonyEvent` union in
`platform/src/telephony/interfaces`, translate in the Telnyx adapter, and switch
`CallService` over to it. Doable incrementally, event type by event type.

### DEBT-002 — Migration state is ambiguous and partly untracked

**Where:** `packages/database/prisma/` — `migrations/`, `migrations-pending/`,
`pending-migrations/`; `.gitignore`; root `package.json`

**What:** three migration directories exist. `.gitignore` ignores
`prisma/migrations` and its re-inclusion patterns are self-cancelling, so
**zero** files under `migrations/` are tracked, while `migrations-pending/`
(11 dirs) and `pending-migrations/` (3 `.sql` files) are. On top of that,
`pnpm prisma:migrate` delegates to a script that does not exist in
`packages/database/package.json`.

**Why it matters:** there is no single, reproducible statement of the production
schema history in the repository, and the documented migration command fails.

**Direction:** decide which folder is authoritative, fix the `.gitignore`
patterns, consolidate, and either add a real `prisma:migrate` script or remove
the root alias. This is a team decision, not a refactor to do incidentally.

### DEBT-003 — Unused `AuthGuard` with a hard-coded JWT secret

**Where:** `packages/platform/src/auth/auth.guard.ts`, exported from
`packages/platform/src/auth/index.ts`

**What:** a JWT guard that verifies with `secret: "secretKey"`. It is wired into
nothing today — `ClerkAuthGuard` is the real global guard — but it is exported
and named exactly like something a developer would reach for.

**Why it matters:** any route that adopts it accepts tokens anyone can forge.

**Direction:** delete it, or if a non-Clerk JWT path is genuinely planned, move
the secret into `@ringee/configuration` and rename it so it cannot be confused
with the real guard.

---

## High

### DEBT-004 — Two phone-normalization implementations

**Where:** `packages/dialer-core/src/phone/normalize.ts` (libphonenumber,
region-aware, validating) and `packages/platform/src/crm/phone.ts`
(`normalizePhoneE164`, regex, length-bounded only)

**What:** the browser path validates against real numbering plans; the server
path accepts anything 6–15 digits and prefixes `+`.

**Why it matters:** the two disagree. A number the CRM matcher normalizes may not
be dialable, and a lead imported server-side can carry a number the dialer later
rejects.

**Direction:** publish one server-safe normalizer (libphonenumber already ships
in `@ringee/platform` and `@ringee/services`) and have `crm/phone.ts` delegate,
keeping `phoneSuffix` / `phoneMatchesSuffix` as the matching helpers.
**Do not add a third normalizer in the meantime.**

### DEBT-005 — MCP authorization is a capability URL, undocumented as such

**Where:** `apps/backend/src/api/routes/mcp.controller.ts`
(`resolveContextById`, `resolveOrgContext`)

**What:** `/api/mcp/:id/sse` and `/messages` are `@Public()`. The workspace is
resolved from the UUID in the path — a valid user or organization UUID is the
only thing required to drive the full tool surface. The org-scoped variant
additionally acts "on behalf of" the first member it finds, or `createdBy`.

**Why it matters:** workspace UUIDs then have to be treated as secrets, but
nothing in the code, the docs or the UI says so. UUIDs leak through logs, support
tickets and URLs far more casually than tokens do.

**Direction:** confirm the intent. If it stays, document it prominently and
consider a signed, revocable connector token instead of a bare UUID.
**`Needs confirmation`.**

### DEBT-006 — Not every credit debit is idempotent

**Where:** `caller.id.service.ts:93`, `ai-pipeline/ai-pipeline-credit.service.ts:73`,
`ai-agents/ai-chat.orchestrator.ts:573`, `ai-agents/ai-summarizer.service.ts:131`

**What:** `consumeCredits` takes an optional idempotency `ref`. Call, message,
transcription and desk-phone debits pass one. These four do not, so they take the
non-ledgered `updateBalance` path.

**Why it matters:** a retry double-charges, and the debit leaves no `CreditDebit`
row — so it is invisible in the ledger.

**Direction:** give each a stable key (`caller-id-verification:<numberId>:<attempt>`,
`ai-run:<runId>`, `ai-message:<messageId>`, `ai-summary:<conversationId>`), then
make `ref` **required** so the gap cannot reopen.

### DEBT-007 — Controllers that bypass the service layer

**Where:** `chat.auth.controller.ts`, `clerk.controller.ts`,
`custom-integrations.controller.ts`, `dialer.controller.ts`,
`encryption.controller.ts`, `mobile.controller.ts`, `telephony.controller.ts`,
`user-access-enforcement.service.ts`

**What:** eight files inject repositories directly, putting persistence and some
decision-making in the API layer.

**Why it matters:** the ownership and business rules those services own get
re-implemented, or silently skipped, per controller.

**Direction:** move each to the owning service as those areas are touched. Do not
add new ones — `apps/backend/AGENTS.md` says so.

### DEBT-008 — Super-admin allowlist duplicated in two places

**Where:** `apps/backend/src/api/guards/super-admin.guard.ts`
(`DEFAULT_SUPER_ADMIN_EMAILS`) and
`apps/frontend/src/features/backoffice/lib/super-admins.ts`

**What:** two hard-coded lists of personal email addresses kept in sync by a code
comment.

**Why it matters:** drift silently changes who sees the backoffice UI vs. who can
actually call it, and staff addresses are committed to a public repository.

**Direction:** make `BACKOFFICE_SUPER_ADMIN_EMAILS` the only source and have the
frontend ask the API "am I staff?" instead of holding a list.

---

## Medium

### DEBT-009 — The verified-caller-ID margin is dead code

**Where:** `packages/services/src/services/call.service.ts:1349`

```ts
// Calls placed from a verified caller ID carry an extra 0.3 added to
// the profit-margin multiplier.
const profitMargin = usedCallerId ? baseMargin + 0 : baseMargin;
```

**What:** the comment describes `+ 0.3`; the code adds `0`. The `isVerifiedCallerId`
lookup runs on every settlement and its result is discarded.

**Why it matters:** either the pricing rule is not being applied, or the lookup is
wasted work on every call. A reader cannot tell which is intended.

**Direction:** decide, then either restore the surcharge (ideally as a named env
multiplier) or delete the branch and the lookup.

### DEBT-010 — Configuration read straight from `process.env` in domain code

**Where:** 22 occurrences under `packages/services/src` — `calendar.service.ts`
(Google/Microsoft OAuth credentials), `call.service.ts` (`CALL_PROFIT_MARGIN`,
`TELNYX_CONNECTION_ID`), `caller.id.service.ts`
(`CALLER_ID_VERIFICATION_FEE`), `inbox/message.service.ts`
(`MESSAGE_PROFIT_MARGIN`)

**What:** `@ringee/configuration` exists precisely to validate configuration at
startup and fail fast, and these bypass it.

**Why it matters:** a missing or malformed value degrades silently at runtime —
a wrong margin quietly charges the wrong price — instead of refusing to boot.

**Direction:** move them into `api.configuration.ts` with validation, as the
transcription and AI margins already are.

### DEBT-011 — Internal team email hard-coded in a service

**Where:** `packages/services/src/services/free-trial.service.ts:18`

A personal address is the destination for free-trial requests in a public,
self-hostable repository. Self-hosters silently mail the Ringee maintainer.
Should be configuration with a sensible default.

### DEBT-012 — `ServicesModule` is a single 363-line module

**Where:** `packages/services/src/services/services.module.ts`

Everything is registered in one module, so every consumer — including the
orchestrator and the MCP layer — instantiates the entire service graph. Splitting
by domain would make the dependency direction between domains explicit and
enforceable.

### DEBT-013 — Two campaign status vocabularies

`Campaign.status` is a plain `String` validated against `VALID_CAMPAIGN_STATUSES`
in a DTO, while every neighbouring concept (`CampaignLeadStatus`,
`AgentSessionStatus`, `CallAttemptStatus`, `CallSessionStatus`) is a Prisma enum.
The database cannot reject an invalid campaign status.

### DEBT-014 — Provider abstraction is single-implementation in places

`TelephonyService.getServiceProvider()` is a `switch` with only a `default`
returning Telnyx. Not wrong — but it means the abstraction is untested against a
second implementation, and `DEBT-001` shows where it has already been bypassed.

---

## Low

### DEBT-015 — Lint baseline is large

~5,000 findings in source (overwhelmingly `prettier/prettier` and
`no-unused-vars`), so `pnpm lint` cannot be used as a pass/fail gate. Prettier is
run on staged files by lint-staged only in `apps/frontend`.

**Direction:** run `prettier --write` across the repo once as an isolated,
review-friendly commit, then make lint a gate.

### DEBT-016 — No CI configuration in the repository

There is no `.github/workflows`. Every rule in `AGENTS.md` and every ESLint
boundary rests on someone running the commands locally.

**Direction:** a minimal workflow — install, `prisma:generate`, `eslint` on
changed paths, `pnpm test`, `build:backend` + `build:frontend` — would make the
boundaries real.

### DEBT-017 — Mixed-language comments and error copy

Comments and log messages alternate between English and Spanish
(`"⚠️ Llamada ${callControlId} no encontrada"`, `"Error al obtener usuario:"`),
sometimes inside the same file. Harmless, but it makes searching for a log line
harder. New code is English.

### DEBT-018 — Duplicate hook file

`packages/frontend-shared/src/hooks/use-callback-ref.ts` and
`use-callback-ref.tsx` both exist.
