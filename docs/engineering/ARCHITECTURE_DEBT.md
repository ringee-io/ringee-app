# Architecture debt

Register of problems found while auditing the repository, and what happened to
each. Rules and current behaviour are documented elsewhere — this is the one
file where *proposed* improvements live, so "what is true" never blurs into
"what should be".

Status: **Fixed** · **Open** (deliberately deferred) · **Won't fix here**.

Severity: **Critical** = correctness/security exposure · **High** = a recurring
source of bugs · **Medium** = friction and drift · **Low** = tidy-up.

---

## Open

These three are deferred by an explicit decision, not by oversight.

### DEBT-002 — Migration state is ambiguous and partly untracked · Critical · Open

**Where:** `packages/database/prisma/` — `migrations/`, `migrations-pending/`,
`pending-migrations/`; `.gitignore`; root `package.json`

**What:** three migration directories exist. `.gitignore` ignores
`prisma/migrations` and its re-inclusion patterns are self-cancelling, so
**zero** files under `migrations/` are tracked, while `migrations-pending/`
(11 dirs) and `pending-migrations/` (3 `.sql` files) are. `pnpm prisma:migrate`
also delegates to a script that does not exist in
`packages/database/package.json`; what exists there is `prisma-db-push`,
`db:deploy`, `prisma:generate`, `prisma-format` and `seed:offers`.

**Why it matters:** there is no single reproducible statement of the production
schema history in the repository, and the documented migration command fails.

**Direction:** decide which folder is authoritative, fix the `.gitignore`
patterns, consolidate, and either add a real `prisma:migrate` script or drop the
root alias. A team decision about production schema history — not something to
resolve as a side effect of another task.

**Knock-on:** `DEBT-013` is capped by this. `Campaign.status` should be a Prisma
enum like every neighbouring status, but promoting a `String` column to an enum
needs a migration, and the migration workflow is what is unresolved here. The
TypeScript-level enforcement has been tightened in the meantime — see below.

### DEBT-005 — MCP authorization is a capability URL · High · Open (intentional)

**Where:** `apps/backend/src/api/routes/mcp.controller.ts`
(`resolveContextById`, `resolveOrgContext`)

**What:** `/api/mcp/:id/sse` and `/messages` are `@Public()`. The workspace is
resolved from the UUID in the path — a valid user or organization UUID is the
only thing required to drive the full tool surface. The org-scoped variant acts
"on behalf of" the first member it finds, or `createdBy`.

**Status:** confirmed intentional for now. The connector URL is the credential,
the same model as a Slack or Stripe webhook URL.

**Consequence to keep in mind:** workspace UUIDs are therefore secrets. Do not
log them, put them in error messages, or expose them in URLs that reach a third
party. Revisit if MCP connectors are ever shared more widely than one operator
per workspace — a signed, revocable connector token would be the upgrade.

### BILL-017 — Whether enrichment stays off Ringee credits · Open (needs product confirmation)

Lead search / reveal / import bill against the customer's own Apollo or Prospeo
account, not the Ringee balance. Verified in code for the current provider set.
Whether that is a permanent product rule or a property of these two providers is
not stated anywhere, so it is documented as `Needs confirmation` in
[BUSINESS_RULES.md](BUSINESS_RULES.md) rather than as a binding rule.

---

## Won't fix here

### DEBT-012 — `ServicesModule` is one 232-provider module · Medium

**Where:** `packages/services/src/services/services.module.ts`

**What:** every service is registered in a single `allProviders` array used for
both `providers` and `exports`, so every consumer — the backend, the
orchestrator, the MCP layer — instantiates the whole graph.

**Why it was not done:** splitting it into domain modules is not mechanical
here. There are 52 cross-domain service imports and `CallService` alone injects
22 other services, so domain modules would import each other circularly and need
`forwardRef` in several places. NestJS resolves that at **runtime**: a wrong
split compiles cleanly and fails at boot with "Nest can't resolve dependencies".
Verifying it needs the app actually started against Postgres, Redis and
Temporal, which was not available in this environment. Doing it blind would risk
breaking startup for everyone to gain internal tidiness.

**Direction:** map the dependency graph first, extract the leaf domains that
nothing else depends on (`offers`, `enrichment`, `reminders`), and verify each
extraction by booting the backend before doing the next. Do it when someone can
run the app.

### Mixed-language user-facing copy · Low

`packages/platform/src/ai/openai/openai.service.ts` returns a hard-coded Spanish
fallback ("Hubo un error al intentar usar una herramienta.") to the user when a
tool call cannot be parsed. Comments and logs have been translated (`DEBT-017`),
but this one is **user-facing copy**, and the product ships two locales — so
which language it should be, and whether it should be routed through i18n at
all, is a product call rather than a comment cleanup.

---

## Fixed

### DEBT-019 — TriggerLoop webhook guard was disabled · Critical · Fixed

`TriggerLoopWebhookGuard.canActivate` had its entire body commented out and
returned `true`, leaving `POST /api/internal/triggerloop/webhook` — which
executes actions that send email, push notifications and create tasks —
unauthenticated behind a `@Public()` controller.
`TRIGGERLOOP_WEBHOOK_SECRET` existed in configuration and was never read.

The constant-time secret comparison is restored and now fails closed: a missing
header, or an unconfigured secret, rejects the request.
**`TRIGGERLOOP_WEBHOOK_SECRET` must be set wherever TriggerLoop is enabled**, or
that endpoint returns 401 — it is documented in `.env.example`.

### DEBT-001 — No inbound provider-event normalization · Critical · Fixed

The provider abstraction was one-way: outbound commands went through
`TelephonyService`, but inbound webhooks reached the domain as raw
`TelnyxWebhookEvent`s and `CallService` switched on Telnyx event names.

Added `TelephonyEvent` / `TelephonyEventType`
(`packages/platform/src/telephony/interfaces/telephony.event.ts`) and
`TelnyxEventNormalizer` (`…/telnyx/telnyx.event.normalizer.ts`). The controller
translates at the edge; `CallService.handleTelephonyEvent` switches on Ringee
names. `TelnyxWebhookEvent` no longer appears anywhere in `@ringee/services`.

The normalization does real work rather than renaming: the premium
answering-machine tier folds into `call.machine.greeting.ended` (the domain had
to list both), `streaming.failed` becomes `call.streaming.failed`, both
spellings of each direction collapse, and common fields (`from`, `to`,
`direction`, `callSessionId`, `callLegId`, `clientState`, `startedAt`,
`customHeaders`) are lifted out of the payload. 10 tests cover it.

**Deliberately still partial:** event *bodies* (cost parts, recording URLs,
transcription segments) remain provider-shaped and are reached through
`event.payload` with a cast. Normalizing those too would be a rewrite of the
call lifecycle rather than a boundary. The boundary is what mattered — a second
carrier now needs a translator, not changes to `CallService`.

### DEBT-003 — Unused `AuthGuard` with a hard-coded JWT secret · Critical · Fixed

The now-deleted `auth.guard.ts` in `packages/platform/src/auth` verified tokens
with `secret: "secretKey"`. It was wired into nothing but exported from the
package barrel, named exactly like something a developer would reach for. Gone,
along with the `jwt.auth.ts` re-export that existed only to support it.

### DEBT-004 — Two phone normalizers that disagreed · High · Fixed

`packages/platform/src/crm/phone.ts` now uses libphonenumber, with the previous
lenient digits-only path kept as a **fallback** for the unparseable-but-real
values CRM records hold (extensions, partial prefixes, country-less locals) so
nothing that used to match stops matching.

Verified against the old implementation across 15 inputs: **zero** regressions,
four improvements. Notably `"+1 415 555 2671 ext 22"` used to normalize to
`+1415555267122` — the extension digits appended to the number — and now yields
`+14155552671`. Country-less US numbers now get their country code instead of a
different, wrong number. 7 tests lock this in.

Browser and server normalizers still exist separately (libphonenumber in both
now, different runtimes and lenience). That is the intended end state; the
disagreement was the bug.

### DEBT-006 — Not every credit debit was idempotent · High · Fixed

Four debit sites passed no idempotency `ref`, taking a non-ledgered
`updateBalance` path — so the debit was invisible in `CreditDebit` and a retry
double-charged.

`consumeCredits`' `ref` is now **required**, so the gap cannot reopen. The four
sites were given keys matched to their semantics:

- **Caller-ID verification** — real replay protection, keyed to the verification
  *attempt* (`caller-id-verification:<numberId>:<requestedAt>`), so re-sending a
  code bills again while a double-submitted request does not. Its refund path
  moved from the unledgered `addCredits` to `grantCreditsOnce`.
- **AI chat turns, summaries and pipeline runs** — keyed per invocation via the
  new `incurredCostDebitRef`. These charges have no natural replay key: the
  model call already happened and the provider already billed us, so a retry is
  a *new* cost, not a duplicate. The unique suffix keeps each one in the ledger
  instead of collapsing them into one row or skipping it entirely.

`addCredits` is marked `@deprecated` in favour of the ledgered paths.

### DEBT-007 — Controllers bypassing the service layer · High · Fixed

Eight files injected repositories directly; the mobile controller additionally
ran eight raw `PrismaService` queries. **No controller does either now.**

- `EncryptionKeyService`, `TelephonyRateService` and `MobileReadService` created
  for logic that had no owner.
- `UserService` / `OrganizationService` gained the Clerk sync operations, so the
  Clerk webhook controller orchestrates instead of persisting. The TriggerLoop
  side effects stay in the controller — `@ringee/services` is deliberately kept
  free of that module.
- `CampaignService.assertDialableCampaign` / `assertCampaignInWorkspace` now own
  the dialer's ownership + membership rule (CMP-002), which the controller had
  reimplemented. Both preserve the dialer's existing Forbidden-for-missing
  behaviour rather than adopting `getCampaignById`'s 404.
- `UserDeviceService` owns push-token registration, including the mobile-specific
  5-device cap that differed from its own 10.
- `MobileReadService` keeps each mobile query together with its workspace
  visibility check, which is the point — a controller owning half that pair is
  one refactor from dropping the other half.

Still true, and much smaller: `user-access-enforcement.service.ts` and
`stripe-abuse-protection.service.ts` are *services* that live under
`api/routes/`. Injecting repositories there is legitimate; they are just
misplaced.

### DEBT-008 — Super-admin allowlist duplicated · High · Fixed

The two hard-coded lists had **already drifted** — five emails on the frontend,
three on the backend — which is exactly the failure the entry predicted.

`BACKOFFICE_SUPER_ADMIN_EMAILS` is now the only source, with **no built-in
fallback**: Ringee is a public, self-hostable repository, and a committed
default list made the upstream maintainers super-admins of every deployment.
Unset now means "nobody has backoffice access here", which fails closed.

The dashboard asks `GET /api/backoffice/access` (a new, authenticated,
non-privileged endpoint) instead of holding a list, so the UI gate and
`SuperAdminGuard` read the same source and cannot drift again.

**Operational note:** `BACKOFFICE_SUPER_ADMIN_EMAILS` must now be set in any
environment that needs backoffice access.

### DEBT-009 — The verified-caller-ID margin was dead code · Medium · Fixed

The comment described a `+0.3` surcharge; the code added `0`, and the
`isVerifiedCallerId` lookup ran on every settlement with its result discarded.

Now a named, validated setting, `CALLER_ID_PROFIT_MARGIN_SURCHARGE`, defaulting
to **0** — the behaviour that was actually in effect. **Pricing is unchanged.**
Restoring the surcharge is a deliberate `.env` change, because raising it
changes what customers are billed and that is not a decision to make inside a
cleanup. The provider lookup is now skipped entirely when the surcharge is 0.

### DEBT-010 — Configuration read from `process.env` in domain code · Medium · Fixed

All 22 reads under `packages/services/src` moved into `@ringee/configuration`
with startup validation: the call/recording/message margins, the caller-ID
verification fee, `TELNYX_CONNECTION_ID`, the Google/Microsoft calendar OAuth
credentials and `RINGEE_PUBLIC_CALLER_ID`. A malformed margin now refuses to
boot instead of quietly charging the wrong price.

`readProfitMultiplier` was deleted with its test — configuration parses and
validates these now, so it had no callers left.

### DEBT-011 — Internal team email hard-coded · Medium · Fixed

`free-trial.service.ts` mailed a personal address from every deployment of a
public repository. Now `RINGEE_TEAM_EMAIL`, defaulting to `EMAIL_FROM_ADDRESS`.

### DEBT-013 — Two campaign status vocabularies · Medium · Partially fixed

`Campaign.status` is still a `String` column — promoting it to a Prisma enum
needs a migration, and `DEBT-002` is unresolved. What was tightened:

- `UpdateCampaignStatusDto` validates against `VALID_CAMPAIGN_STATUSES` instead
  of a second hard-coded list, and is typed `CampaignStatus`.
- New `isCampaignStatus` guard, used by both `CampaignService.updateStatus` and
  `CampaignConfigService.transitionStatus` — the latter previously accepted any
  string and consulted the transition table with it.
- `CampaignRepository.updateStatus` takes `CampaignStatus`, so an invalid
  literal is a compile error.

The database still cannot reject an invalid value. That is the remaining half,
and it is blocked on `DEBT-002`.

### DEBT-014 — Provider abstraction single-implementation · Medium · Substantially addressed

The substance of this was `DEBT-001`: the abstraction was being bypassed on the
inbound path. With a normalizer in place, `TelephonyService.getServiceProvider()`
being a one-case switch is now just an unexercised extension point rather than
evidence of a leak.

### DEBT-015 — Lint baseline too large to gate on · Low · Fixed

**5,281 → 557 problems**, and every formatting finding is gone
(`prettier/prettier`: 2,547 → 0).

Two causes, and the larger one was not formatting: ~3.9k findings came from
generated bundles ESLint was reading — `apps/sdk-playground/ui-gallery/gallery.js`
(esbuild output), `apps/sdk-playground/live/vendor/` and the Workbox service
worker. All are git-ignored build artifacts and are now ESLint-ignored too,
alongside `.next-mine`-style local build directories. The rest was a
`prettier --write` pass over source.

What remains is real signal: 254 `no-explicit-any`, 140 unused vars, 57
`ban-ts-comment`. Worth chipping at; no longer noise hiding findings.

### DEBT-016 — No CI · Low · Fixed

`.github/workflows/ci.yml`: install → `prisma:generate` → lint (advisory) →
**architecture-boundary gate** → `pnpm test` → build.

The boundary gate is the part that matters. `ARCH-001`..`ARCH-004` are at zero
violations, so the workflow fails the build on any new one while the remaining
lint baseline stays advisory. Placeholder env vars are supplied because
`@ringee/configuration` exits at import time on missing values.

### DEBT-017 — Mixed-language comments · Low · Fixed

Spanish comments and log messages translated across
`ownership.types.ts` (the canonical tenancy file), `current.user.ts`,
`organization.repository.ts`, `call.transcription.service.ts`,
`contact.service.ts`, `telnyx.webhook.types.ts` and `use.callback.dial.ts`.
The `es` locale in `packages/dialer-sdk/src/ui/strings.ts` is shipped i18n copy
and was left alone; the one remaining user-facing Spanish string is noted under
"Won't fix here".

### DEBT-018 — Duplicate hook file · Low · Fixed

`use-callback-ref.ts` and `use-callback-ref.tsx` were byte-identical. The `.tsx`
copy (which contained no JSX) is gone.

### Vitest include list was an allowlist · Low · Fixed

Found while adding tests: `packages/platform/vitest.config.ts` included only
`src/sdk/**` and `src/crm/**`, so a new test file anywhere else in the package
was silently never run. Widened to `src/**/*.test.ts`.
