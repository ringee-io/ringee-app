# Business rules

Rules extracted from the code as it exists today. Each has a stable ID so it can
be referenced from code comments, tests, PRs, issues and agent instructions.

**These are constraints, not suggestions.** Do not remove, weaken or bypass one to
make an implementation easier. If a feature requires changing a rule, say so
explicitly, name the ID, and change the rule and this document deliberately.

Rules marked **`Needs confirmation`** are behaviours visible in the code whose
_intent_ could not be verified. Do not treat them as binding.

---

## Workspace & tenancy (`WRK`)

### WRK-001 — A workspace is either an organization or a single user, never both

`buildOwnershipFilter` filters by `organizationId` alone when one is present, and
by `userId` **plus** `organizationId: null` when it is not.

- **Source of truth:** `packages/platform/src/auth/ownership.types.ts`
- **Affected:** every tenant-scoped repository and service
- **Why:** one predicate for tenancy across ~90 repositories
- **Risk if violated:** an org member sees personal rows, or a freelancer's data
  merges into an organization's

### WRK-002 — A resource is never acted on by id alone

Services load the row, then compare its `organizationId` to the caller's context
before returning or mutating it (`CampaignService.getCampaignById` is the
reference).

- **Source of truth:** `packages/services/src/services/campaign.service.ts`
- **Risk if violated:** cross-workspace data exposure — a guessed or leaked UUID
  becomes read/write access

### WRK-003 — Org members are forced to their own data on member-scoped lists

`resolveMemberFilter` returns the requested `memberId` only for `org:admin`. An
`org:member` is pinned to their own `user.id` whatever they ask for. Freelancers
need no narrowing (WRK-001 already restricts them).

- **Source of truth:** `resolveMemberFilter` in `ownership.types.ts`
- **Affected:** pending actions, recordings, call history, dashboard analytics
- **Risk if violated:** a member reads a teammate's calls and recordings

### WRK-004 — Freelancers are unrestricted; role limits apply only inside an org

`OrgAdminGuard` returns true when there is no `clerkOrgId`. `useOrgRole()` mirrors
this with `canAccessAdminFeatures = !hasOrg || isOrgAdmin`.

- **Source of truth:** `packages/platform/src/auth/org-admin.guard.ts`,
  `packages/frontend-shared/src/hooks/use-org-role.ts`
- **Risk if violated:** solo users are locked out of features they own

### WRK-005 — Frontend role checks are never the boundary

`RoleGuard` and `hiddenForMember` are UX. The server enforces the same rule with
`@OrgAdminOnly()` (47 usages) and `@SuperAdminOnly()`.

- **Risk if violated:** privilege escalation by typing a URL

### WRK-006 — Backoffice access is an email allowlist, resolved from Clerk

`SuperAdminGuard` reads the Clerk user's verified emails and compares them to
`BACKOFFICE_SUPER_ADMIN_EMAILS`, falling back to a hard-coded list.

- **Source of truth:** `apps/backend/src/api/guards/super-admin.guard.ts`
- **Note:** the fallback list must stay in sync with
  `apps/frontend/src/features/backoffice/lib/super-admins.ts`

### WRK-007 — A blocked account cannot authenticate

`ClerkAuthGuard` rejects a user with `blockedAt` set. The one exception is a
block created by a Clerk ban that Clerk has since lifted, which is repaired on
the next request; a block from any other Ringee enforcement path is never lifted
automatically.

- **Source of truth:** `apps/backend/src/clerk.auth.guard.ts`

---

## Authentication (`AUTH`)

### AUTH-001 — Every route is authenticated unless explicitly made public

`ClerkAuthGuard` is registered as a global `APP_GUARD`.

- **Source of truth:** `apps/backend/src/app.module.ts`

### AUTH-002 — Every `@Public()` route carries its own proof of authorization

Verified provider signature (Telnyx, Stripe, Clerk), hashed magic-link token
(`CallSessionAccessTokenService`), SDK session (`SdkSessionGuard`), or API key
(`CustomIntegration`). A `@Public()` route with none of these is a vulnerability.

- **Risk if violated:** unauthenticated access to tenant data or spend

### AUTH-003 — The Ringee user id comes from Clerk private metadata, not the client

`CurrentUser` resolves `privateMetadata.userId`, repairing the signup race by
syncing from Clerk on first request. It throws when the id is missing.

- **Source of truth:** `packages/platform/src/auth/clerk/current.user.ts`,
  `ClerkAuthGuard.resolveRingeeUser`

---

## Billing & credits (`BILL`)

### BILL-001 — `CreditService` is the only path to a balance

Three doors: `creditTopupOnce` (purchases), `grantCreditsOnce` (non-purchase
grants), `consumeCredits` (debits). Nothing else may write `Credit.amount`.

- **Source of truth:** `packages/services/src/services/credit.service.ts`
- **Risk if violated:** unaudited money movement, no idempotency

### BILL-002 — Credits are added by the confirmed Stripe webhook, and only there

`creditTopupOnce` is called exclusively after Stripe confirms payment — for
one-time top-ups, saved-card charges, auto-reload and monthly-fund cycles alike.

- **Source of truth:** `credit.service.ts`,
  `apps/backend/src/api/routes/stripe.controller.ts`
- **Risk if violated:** credits granted for a payment that never settled

### BILL-003 — Every balance change is idempotent and ledgered in one transaction

The `ref` on `consumeCredits` is required, so no debit can take an unledgered
path. See [BILLING.md](BILLING.md) for which of the two key shapes to use.

`CreditTopup`, `CreditGrant` and `CreditDebit` each hold a unique idempotency key
written in the same transaction as the balance move. A duplicate key returns
`false` / `debited: false` and leaves the balance untouched.

- **Source of truth:** `packages/database/src/database/repositories/credit.repository.ts`
  (`consumeOnce`, `grantOnce`, `topupOnce`)
- **Risk if violated:** a Stripe webhook retry or a duplicated Telnyx `call.cost`
  double-charges the customer

### BILL-004 — Replays must not re-fire side effects

Callers gate notifications, analytics and auto-reload re-arming on the boolean
returned by the idempotent methods.

- **Source of truth:** `consumeCredits` → `if (result.debited)`

### BILL-005 — Balance changes are atomic increments, never read-modify-write

`prisma.credit.update({ data: { amount: { increment } } })`.

- **Risk if violated:** concurrent calls overwrite each other's debits

### BILL-006 — Auto-reload charges exactly once per drop below threshold

An atomic `active -> charging` compare-and-swap (`tryBeginAutoReload`) elects one
winner among concurrent `consumeCredits` calls. The winner stays `charging`; only
the confirmed webhook credits the balance and re-arms to `active`. A stable
per-minute Stripe idempotency key backs this up.

- **Source of truth:** `CreditService.checkAutoReload`
- **Risk if violated:** repeated card charges while the balance stays low

### BILL-007 — Auto-reload requires a saved card and explicit consent

`enableAutoReload` resolves the payment method from Stripe (not from local
state), refuses with `requires_payment_method` when absent, and stores
`autoReloadConsentAt`. It does **not** charge at setup.

### BILL-008 — A failed auto-reload stops firing until the user acts

Status moves to `requires_payment_method` (card needs replacing) or `failed`
(transient decline). Neither re-arms on its own.

### BILL-009 — A call is refused when the caller has no credit

Checked at three points: dial pre-flight, the `call.initiated` webhook
(`ensureCallAffordable`), and again on answer (`enforceAnsweredCreditPolicy`).
A live call is hung up when the balance is not positive.

- **Source of truth:** `packages/services/src/services/call.service.ts`
- **Why:** the browser places the WebRTC leg, so a client can skip any single
  client-side gate

### BILL-010 — A low balance caps call duration

At or below `LOW_BALANCE_USD` ($2) an answered outbound call is capped at
`LOW_BALANCE_MAX_CALL_SECONDS` (5 minutes).

### BILL-011 — `canCall === false` blocks outbound calling outright

Checked before the balance, at both pre-flight and answer. An in-flight call is
hung up.

### BILL-012 — Call cost is settled once, from the provider CDR

The `call.cost` webhook is the settlement event. A non-null `Call.totalCost` is
the idempotency guard, on top of the `call-cost:<callId>` ledger key.

- **Source of truth:** `CallService.handleTelnyxEvent`, case `call.cost`

### BILL-013 — Customer price = provider cost × margin, with recording priced separately

`calculateCallCharge` applies `CALL_PROFIT_MARGIN` to every non-recording cost
part and `CALL_RECORDING_PROFIT_MARGIN` to the `call-recording` part. When the
carrier omits `cost_parts`, `total_cost` is treated as voice cost. A call that
presented a verified caller ID adds `CALLER_ID_PROFIT_MARGIN_SURCHARGE`
(default 0 — no surcharge).

- **Source of truth:** `packages/services/src/services/call-cost.util.ts` (+ spec);
  multipliers validated at startup in `@ringee/configuration`
- **Risk if violated:** silent margin loss on every call

### BILL-014 — Amounts are USD floats; margins are multipliers ≥ 0

`Credit.amount`, `Call.totalCost` and top-up amounts are `Float` USD.
`CreditTopup` additionally stores `amountCents`. Every margin is read and
validated at startup by `@ringee/configuration` — a malformed value refuses to
boot rather than quietly billing the wrong amount.

### BILL-015 — Messages, transcription and AI pipelines are billed like calls

`message-cost:<messageId>`, `transcription-realtime:<headerId>`,
`transcription-recording:<headerId>` — each with its own margin env var. AI
pipeline runs are priced per token and refuse to complete on an unpriced model or
a zero charge (`AiPipelineChargeError`).

### BILL-016 — Caller-ID verification is charged per attempt sent

Flat `CALLER_ID_VERIFICATION_FEE` (default $1.00). A caller with a balance below
the fee is refused with HTTP 402. The debit is keyed to the verification
_attempt_, so re-sending a code bills again while a double-submitted request does
not; a provider rejection refunds through the ledgered grant path.

- **Source of truth:** `packages/services/src/services/caller.id.service.ts`

### BILL-017 — Lead enrichment does not consume Ringee credits

Lead search / reveal / import bill against the user's own connected provider
(Apollo or Prospeo), not the Ringee balance.

- **Source of truth:** `packages/services/src/services/enrichment/`, agent rules
  in `packages/agent/src/rules/index.ts`
- **`Needs confirmation`** — verified for the current provider set; whether it is
  a permanent product rule is not stated in code

### BILL-018 — Free-trial calls are granted manually, one request per user

`FreeTrialService.createRequest` is idempotent per user and emails the Ringee
team. `User.freeCallTrial` then bypasses the pre-answer credit gates.

- **Note:** the `call.cost` handler deliberately charges **anyway** — the comment
  reads "Free-call trial intentionally disabled: always charge credits". Trial
  users can therefore reach a negative balance. **`Needs confirmation`**

### BILL-019 — A falling balance is announced at the points where it changes what the product does

`CreditService.consumeCredits` hands every ledgered debit to
`CreditBalanceAlertService`, which alerts only when that debit **crossed** a
threshold — so each tier fires once per drop and re-arms on the next top-up,
without needing stored state to decide that.

A second guard sits behind it: `isFirstDelivery` claims a per-workspace,
per-tier Redis marker (`SET NX`, one-hour TTL) and suppresses the alert when
the key already exists. It exists to stop two debits that commit in the same
instant from both reporting one crossing; the side effect is that a workspace
that tops up and crosses the same tier again inside the hour is not alerted a
second time. A Redis failure allows the send rather than silencing it.

| Tier            | Organization | Personal | What it means                                      |
| --------------- | ------------ | -------- | -------------------------------------------------- |
| `early_warning` | $5           | —        | nothing restricted yet                             |
| `call_cap`      | $2           | $2       | answered calls are hung up at 5 minutes (BILL-010) |
| `depleted`      | $0           | $0       | workspace inactive; no outbound call is placed     |

- **Source of truth:** `packages/services/src/services/credit-policy.ts`
  (thresholds, shared with the call gate) and `credit-balance-alert.service.ts`
- **Delivery:** email to every recipient, plus push to each registered device.
  Organizations alert their **admins**; a personal workspace alerts its owner.
- **Why:** the $2 tier is not a courtesy — it is the point where BILL-010 starts
  cutting conversations off mid-call, and a customer who is not told blames the
  line, not the balance.
- **Best-effort:** an alert failure must never fail the debit that triggered it.

### BILL-020 — An AI voice agent call settles twice, from two different meters

The voice leg settles like any other call (BILL-012). The AI half — the
provider's conversation engine and its LLM tokens — is metered separately, is
not in `cost_parts`, and is only published to the provider's usage records some
minutes after the call ends. So it settles on its own:

- Price is the provider's **own reported cost** × `AI_VOICE_AGENT_PROFIT_MARGIN`.
- Debited once under `ai-voice-agent-cost:<callId>`, with
  `AiVoiceAgentCall.costSettledAt` claimed before the debit as the replay guard.
- **Claimed is not debited.** The claim and the debit are two writes with no
  transaction around them, so `costSettledAt` (priced, and owned by this worker)
  is tracked apart from `aiCostDebitedAt` (credits actually taken). A call
  interrupted between the two is claimed but undebited, and the reconciler
  looks for exactly that — `costSettledAt` alone as the sweep filter made such a
  call invisible forever, and the revenue was silently written off. The retry
  reuses the same `ai-voice-agent-cost:<callId>` key, so finishing a debit that
  did land is a no-op rather than a second charge.
- **An empty usage response means "not published yet", never "free".** Settling
  at zero on an empty answer silently gives the call away, so the reconciler
  retries on a schedule instead.

**The voice leg of an agent call settles from the same reconciler**, not from
the cost webhook. `call.cost` is an event of the calling application an agent's
calls go out through, and that application can only deliver TeXML form
callbacks — never the Call Control JSON envelope `/api/call/webhook` verifies.
An agent call waiting on that webhook is an agent call priced at nothing.

- Read from the provider's `sip-trunking` records, which are keyed by the
  control id Ringee writes down when it places the call — so the leg is priced
  from a handle that exists before any webhook could have arrived.
- Priced with `CALL_PROFIT_MARGIN` through the same `calculateCallCharge` the
  webhook uses, written to the same `Call.totalCost` / `costMeta`, and debited
  under the same **`call-cost:<callId>`** key. The key is globally unique, so if
  the webhook ever does arrive only one of the two paths can charge for the leg,
  and `totalCost` is the marker both read before pricing.
- All of a call's legs are summed, not just the first — a failed attempt before
  the one that connected is its own record.

**Either provider handle is enough to reconcile.** `providerConversationId` is
only ever written by the conversation webhook, so requiring it in the sweep
filter hid every call whose webhook never arrived — permanently, and silently,
because those are exactly the calls nothing else was going to price. The sweep
accepts `providerCallControlId` and backfills the conversation id from the
records themselves.

- **Source of truth:** `services/voice-agents/voice-agent-billing.service.ts`
  (+ spec); swept by the `ringee.voice-agent-sweep` Temporal Schedule

---

## Telephony — calls (`CALL`)

### CALL-001 — One call at a time per user, across every device

Enforced by `ConcurrentCallGuardService` with three stores: a Redis `SET NX`
lease (atomicity), Postgres `Call` rows (truth), and the provider (referee).

- **Source of truth:** `packages/services/src/services/security/concurrent-call-guard.service.ts`
- **Why:** stops one account being shared by several people
- **Risk if violated:** account sharing, or — inverted — a user locked out of
  calling by a ghost call

### CALL-002 — The rule is per user id and never crosses users

An organization may have as many simultaneous calls as it has members. A dial is
never refused because of a teammate's call.

### CALL-003 — Inbound ringing does not occupy the user; org inbound never does

A ringing inbound leg has not been picked up. Inside an organization an inbound
row is attributed to the number's _owner_, not the member who answers, so it must
never mark anyone busy. Server-originated voicemail drops likewise occupy nobody,
and so do AI voice agent calls: the agent is the one talking, and counting its
call would lock the owner out of their own dialer for its whole duration.

- **Source of truth:** `occupiesTheUser`, `isServerOriginatedDrop`,
  `isVoiceAgentCall` (the last reads `Call.source`, which is safe because only
  the agent call service ever writes that value)

### CALL-004 — A call row older than the trust window must be confirmed live before it refuses a dial

`confirmStillLive` asks the provider and closes the row when the leg is gone. If
the provider cannot be reached, the row is believed up to a hard limit (15 min
ringing / 8 h connected) and then closed anyway.

- **Why:** one lost `call.hangup` webhook must not lock an account out of calling

### CALL-005 — The `call.initiated` webhook is the authoritative concurrency backstop

Client-side checks can be skipped — the browser talks to Telnyx directly. Every
outbound leg is re-checked server-side and hung up if the user is already busy.

### CALL-006 — A lease is released only by the leg that owns it

`release(userId, callControlId)` no-ops when the lease is bound to a different
call, and `releasePending` only drops an unbound lease owned by the same device.

- **Risk if violated:** a late hangup frees the slot for a second device

### CALL-007 — `CallStatus` is the domain state; Telnyx states stay in the provider layer

`pending → ringing → answered → recording → completed | failed`. `pending` is
excluded from "occupying" statuses because the SDK creates a pending row at
authorize time.

- **Source of truth:** `CallStatus` in `schema.prisma`;
  browser-side mapping in `packages/dialer-core/src/engine/state-map.ts`

### CALL-008 — `CallService.handleTelephonyEvent` is the single writer of call state

Every provider event is normalized at the controller and funnels through it. Voicemail-drop legs are routed out
first; SDK legs are adopted via a signed correlation header rather than creating
a duplicate row.

### CALL-009 — Webhooks that arrive out of order are parked and replayed

A hangup that beats `call.initiated` is stored in Redis and applied once the row
exists, so a call never stays `ringing` forever.

- **Source of truth:** `parkOrphanCallEvent` / `replayParkedCallEvents`

### CALL-010 — `isCallAlive() === null` means "unknown", never "ended"

- **Source of truth:** `packages/platform/src/telephony/interfaces/telephony.service.ts`

### CALL-011 — Call outcomes are a closed set

`CallOutcome`: `meeting_booked`, `sale`, `interested`, `follow_up`,
`callback_scheduled`, `not_interested`, `no_answer`, `voicemail`,
`wrong_number`, `gatekeeper`. `hangupCause` distinguishes a real no-pickup from a
carrier rejection, since neither sets `answeredAt`.

---

## Numbers & caller ID (`NUM`)

### NUM-001 — Purchased numbers and verified caller IDs share one table

`NumberPurchased.kind` is `purchased` or `verified_caller_id`. Verification
fields are only meaningful for the latter.

### NUM-002 — A caller ID must be verified before it can be presented

`verified` / `verificationStatus` are set only by the provider verification flow.
Re-verifying an already-verified number is refused.

### NUM-003 — Number use is restricted by surface and by member

`allowedOutboundSources` limits which surfaces may present a number
(`web`, `chrome_extension`, `mobile`, `sip_device`); `allowedOutboundUserIds`
optionally limits which members may. An empty list means no restriction.

### NUM-004 — Inbound routing is exclusive

`inboundMode = desk_phone_only` means the number does not ring in any Ringee app,
while staying usable as an outbound caller ID.

### NUM-005 — Campaign caller ID resolves in a fixed order

Campaign's assigned number → campaign's verified caller ID → any active purchased
number of the organization.

- **Source of truth:** `DialerOrchestrationService.resolveCallerIdNumber`

### NUM-006 — Caller-ID rotation respects daily caps and number health

Rotation is a per-workspace toggle. A number can be `active`, `cooling` (low
health, re-enters after `coolingUntil`), `flagged` (carrier spam mark — never
auto-cleared) or `disabled`. Every campaign dial flows through the selector, so
caps hold campaign-wide.

- **Source of truth:** `packages/services/src/services/caller-id-rotation/`

---

## Campaigns & outbound (`CMP`)

### CMP-001 — Campaigns require an organization

`ensureOrganization(ctx)` throws `ForbiddenException` for a freelancer on every
campaign operation.

### CMP-002 — Campaign access is org match plus membership for non-admins

`campaign.organizationId !== ctx.organizationId` → 403. Non-admins additionally
need a `CampaignMember` row.

### CMP-003 — A lead is claimed by exactly one agent

`SELECT FOR UPDATE SKIP LOCKED` in `CampaignLeadRepository.lockNextLead`.

- **Risk if violated:** two agents dial the same prospect

### CMP-004 — Dialing is blocked outside the calling window

`ComplianceService.isWithinCallingWindow` checks `timezone`, `workStartMin`,
`workEndMin` and `workDays` (defaults 08:00–21:00, all days,
`America/New_York`). Outside the window the tick returns without dialing.

- **Why:** telemarketing hour compliance
- **Risk if violated:** regulatory exposure

### CMP-005 — DNC is scoped, and the lists are never merged

A freelancer consults only their personal list; an org member only the org list.

- **Source of truth:** `ComplianceService.isOnDNC` / `DNCOwnerScope`

### CMP-006 — A lead is retried at most `maxAttempts` times

Default 3, enforced inside `lockNextLead`. Exhausted leads move to `exhausted`.

### CMP-007 — Progressive mode refuses to assign a lead to a busy agent

A cheap pre-check runs before any lock or attempt row is created, so an agent on
a call does not burn attempts. The lease-acquiring check still happens at dial.

- **Why:** burning attempts while an agent talks poisons campaign analytics

### CMP-008 — Campaigns get no exemption from call guarantees

Campaign dials pass the same credit, concurrency, caller-ID and DNC gates as
manual calls.

### CMP-009 — Lead and agent states are closed sets

`CampaignLeadStatus`: `pending`, `queued`, `locked`, `dialing`, `in_call`,
`wrap_up`, `dispositioned`, `scheduled`, `completed`, `exhausted`, `dnc`.
`AgentSessionStatus`: `ready`, `reserved`, `dialing`, `in_call`, `wrap_up`,
`paused`, `offline`.

Campaign status is the exception: a **`String` column**, not a Prisma enum, so
the database cannot reject an invalid value. `CampaignStatus`,
`VALID_CAMPAIGN_STATUSES`, the `isCampaignStatus` guard and the DTO validator are
the enforcement, and `CampaignRepository.updateStatus` is typed to the union.
Promoting the column to an enum is blocked on `DEBT-002`.

### CMP-010 — The dialer poll loop runs only in the API process

`DialerOrchestrationService.startPolling()` is called from
`AppModule.onApplicationBootstrap` because lead assignment is pushed over
in-process SSE. The worker imports the same module and must **not** poll.

- **Risk if violated:** agents stuck on "Waiting for lead"

### CMP-011 — Where a session goes after a lead is decided inside the disposition request

`POST /dialer/dispose` carries `closeSession`, and
`CallAttemptService.submitDisposition` either returns the agent to `ready` or
ends the session — in the same request that wrote the disposition.

- **Source of truth:** `packages/services/src/services/outbound/call-attempt.service.ts`
- **Why:** the poll loop runs every 500ms (`CMP-010`), so a browser that
  dispositioned and _then_ asked to end the session would already have been
  handed the next lead and dialed it
- **Do not** re-implement "stop after this lead" as a client-side end-session
  call, a pause, or a flag the poller reads later — all three race the tick.

---

## Call sessions / magic links (`SESS`)

### SESS-001 — Only the hash of a magic-link token is stored

32 random bytes, returned once, persisted as SHA-256. The token carries no
session data.

- **Source of truth:** `packages/services/src/services/call-session/call-session-access-token.service.ts`

### SESS-002 — Every token failure looks the same

Not found, expired, revoked and deleted all raise the same
`UnauthorizedException`, deliberately, so the failure mode does not leak.

### SESS-003 — Revoking is immediate and preserves history

A revoked session stops resolving at once; its rows remain.

### SESS-004 — A session's contact queue may only be replaced before the first call

`updateSession` refuses a `contacts` replacement unless the session is still
`draft` or `ready` **and** `callsCompleted === 0`.

- **Source of truth:** `CallSessionService.updateSession`

### SESS-005 — Session status transitions and lifetime are bounded

Callers may only move a session between `draft`, `ready`, `paused` and `active`;
`completed`, `expired` and `revoked` are reached by the system, not by request.
`expiresInMinutes` must be between 1 minute and 30 days.

---

## Webhooks & integrations (`HOOK`)

### HOOK-001 — Inbound webhooks fail closed on signature

Telnyx: Ed25519 over `<timestamp>|<rawBody>` with a tolerance window
(`TELNYX_WEBHOOK_TOLERANCE_SECONDS`, default 300s); a missing `TELNYX_PUBLIC_KEY`
rejects everything. Stripe: `validateWebhook` over `req.rawBody`. Clerk: raw body
registered in `main.ts`. Custom Integrations: HMAC over `<timestamp>.<body>`,
compared with `timingSafeEqual`.

- **Risk if violated:** forged calls, forged payments, forged tenant data

### HOOK-002 — Signature verification uses the raw body

Re-serializing the parsed body changes the bytes and breaks verification.

### HOOK-003 — Outbound events are signed and delivered through an outbox

`Ringee-Signature: t=<unixSec>,v1=<hex>` over `<timestamp>.<body>`, drained by a
Temporal schedule in batches of 25. Every event shares the envelope
`{ event, eventId, occurredAt, data }`, plus `workspaceId` and `integrationId`
outbound.

- **Source of truth:** `packages/platform/src/custom-integrations/`

### HOOK-004 — Integration API keys are stored hashed

`cik_live_<64 hex>`; only a `cik_live_<8 hex>` prefix is displayed. Lookup and
comparison are constant-time. Signing secrets are stored encrypted at rest.

### HOOK-005 — Publishable keys are signed, non-secret, and revoked by rotation

`pk_live_<payload>.<hmac>` is designed to sit in browser code. It is bound to the
integration's current `apiKeyPrefix`, so rotating the secret key revokes every
publishable key issued before it. Security comes from the signature plus
server-side origin, OTP and membership checks — never from the key being hidden.

---

## Recordings & transcription (`REC`)

### REC-001 — Recordings are stored twice: a public mp3 and an encrypted private copy

### REC-002 — The encryption key is the workspace's

An org call uses the organization's key; otherwise the user's.

- **Source of truth:** `RecordingProcessingService.getEncryptionKey`

### REC-003 — Recording processing is a retryable activity and must stay idempotent

It runs as a Temporal activity with up to 5 attempts; the public-recording step
is explicitly guarded against duplication.

### REC-004 — Transcription is billed from the provider's reported cost when available

Deepgram's cost is preferred; per-minute duration is the fallback. The charge is
recorded on the header (`chargedOnHangup`) so it happens once.

### REC-005 — An agent call is always recorded, and never transcribed twice

Every other surface asks the workspace whether to record (`recordAllCalls`). An
AI voice agent call is recorded unconditionally — the dial path sets it on the
call itself — so turning workspace recording off does not turn agents off.

Its transcript comes from the voice provider, not from Deepgram. The provider
already transcribed the conversation in order to hold it, so the text exists,
is attributed to a side by construction, and costs nothing to read back;
running Deepgram over the recording would be paying a second time for the same
words. It is stored in the `realtime` slot, because that is what it is —
transcribed live, during the call — with `provider` naming who produced it and
`chargedOnHangup` pre-set so the realtime debit cannot charge for text Deepgram
never made.

Neither artifact is delivered: the provider announces a saved recording as an
event of the calling application, and never announces a transcript at all. Both
are read from the provider in the agent sweep, which keeps looking for up to
`ARTIFACT_RETRY_WINDOW_MS` after the call — a call routinely settles its money
before its audio has finished being written, and a settled call has already
left the billing list.

- **Source of truth:** `VoiceAgentBillingService.recoverArtifacts` /
  `sweepArtifacts`, `VoiceAgentResultService.recoverTranscript`,
  `TranscriptionService.saveProviderTranscript`

---

## Messaging (`MSG`)

### MSG-001 — Message cost is settled once per message

`message-cost:<messageId>` with `MESSAGE_PROFIT_MARGIN`.

### MSG-002 — Messaging capability is a provider-derived snapshot on the number

`NumberPurchasedService` refreshes `smsEnabled` / `mmsEnabled` /
`messagingEnabled` (= sms OR mms) and `messagingStatus` from the provider's
feature list. UI and callers read these flags to decide what a number can do.

- **`Needs confirmation`** — no server-side check was found that _refuses_ a send
  on a number whose snapshot says messaging is unavailable. Treat the flags as
  capability metadata, not as an enforced gate, until confirmed.

---

## Agent / MCP surface (`MCP`)

### MCP-001 — Ids are never invented

Tools accept only ids returned by other tools.

### MCP-002 — Destructive tools are double-guarded

`delete_contact` requires `confirm=true` **and** a `confirmPhoneNumber` matching
the stored number, after an explicit human "yes, delete".

### MCP-003 — Credit-spending actions require human confirmation first

### MCP-004 — `start_call` does not place a call server-side

It pushes to the user's active devices. With no active device, nothing happens.

### MCP-005 — Phone numbers are E.164; datetimes are ISO-8601 with an offset

`E164_REGEX = /^\+[1-9]\d{1,14}$/` in `packages/agent/src/schemas/common.ts`.

---

## AI voice agents (`AGENT`)

### AGENT-001 — The blueprint owns defaults and enforcement; the user owns copy

Instructions and greeting start from the agent type's **blueprint** and are
editable from the agent's Conversation tab. Greeting mode and optional
post-conversation instructions are also user configuration. Existing agents
with no saved override continue to resolve the current blueprint values.

Tools, non-overridable safety rules, the dynamic-variable schema and default
analyses still belong to the blueprint. Custom instructions are never allowed
to remove those enforcement rules: for example, an appointment agent must
still look up availability and receive an explicit booking success before it
claims a meeting exists. A feature that needs a new capability still writes a
blueprint/tool; prompt text alone cannot grant it.

"A model" is a _family_ — "Ringee AI", or a provider they already pay for.
Which model id that maps to stays Ringee's decision, in `models.catalog.ts`. The
id and where it runs are **shown** on the choice ("moonshotai/Kimi-K2.6",
self-hosted), because someone comparing Ringee AI against their own key is
comparing two concrete models; being able to read it is not the same as being
able to set it.

- **Source of truth:** `services/voice-agents/blueprints/*` +
  `VoiceAgentBlueprintRegistry`

### AGENT-002 — An agent never states availability it has not just looked up

The booking agent may only offer a time returned by `get_available_slots`, and
may only say a meeting is booked after `book_appointment` returns success. This
is why the tool path uses `CalendarService.getBookableSlots` — which **fails**
when the calendar is missing or unreachable — rather than `getAvailability`,
which deliberately falls back to "everything is free" for the human picker.

- **Risk if violated:** the agent books over real meetings and tells the person
  a time that was never free

### AGENT-003 — A provider tool callback proves itself, and derives its workspace

The tool routes are `@Public()` because the voice provider calls them
mid-conversation. Each carries the agent's shared secret (stored hashed, held by
the provider as a secret reference, compared in constant time), and the
workspace, calendar and contact are read from the stored agent row. The call's
identity comes from a header the provider fills from a system variable — never
from the model's own arguments.

- **Source of truth:** `services/voice-agents/voice-agent-tool.service.ts`

### AGENT-004 — One execution path, whatever started the call

Web, the public API, the CLI and MCP all reach `VoiceAgentCallService.startCall`,
which applies the calling-rights, DNC, balance and caller-ID gates in that order.
A new surface calls it; it does not re-implement the gates.

### AGENT-005 — A browser test session opens the agent only while it runs

Testing an agent from the browser requires the provider to accept an
unauthenticated web call, which makes the agent reachable by anyone holding its
id. The window is opened on start and closed on stop, on unmount, and by the
`ringee.voice-agent-sweep` schedule if the tab simply went away.

### AGENT-006 — The tool's result outranks the transcript analysis

When `book_appointment` created a meeting, the outcome is
`appointment_booked` and the post-call analysis may not overwrite it. The tool
knows a row exists; the analysis is only reading what was said.

### AGENT-007 — Company context belongs to the agent, and falls back to the workspace

One workspace runs agents for several brands, products or clients, so the
company an agent introduces itself with is stored on the agent row. An agent
that carries none of its own reads `WorkspaceCompanyProfile` instead, which is
what keeps agents built before per-agent context saying exactly what they said
before. "Carries its own" means it names a company or describes one — a blank
description on a named company is a choice, not a reason to inherit.

Copying another agent's context is a client-side convenience: the values are
duplicated onto the new agent, never referenced, so editing one agent's context
never changes what another agent says.

- **Source of truth:** `CompanyProfileService.resolveForAgent`

### AGENT-008 — The number an agent presents is chosen, never guessed

An agent may be assigned a number of its own (`AiVoiceAgent.callerNumberId`).
At dial time the caller ID resolves in one order, the same for every surface:
the number named on the call, then the agent's own, then — only when the
workspace has exactly one usable number — that number. With several usable
numbers and no assignment the call is **refused**, because a workspace runs
agents for several brands and countries, and the number a stranger sees is not
something to settle by list order.

Whichever id arrives is validated against
`NumberPurchasedService.listOutboundCallerIds(ctx, { source: ai_voice_agent })`:
an id from a client is never authorization to use a number, and an assignment
whose number was since released fails loudly rather than falling back.
Activating an agent re-checks the same thing, so an agent that could not
possibly place a call does not go live.

- **Source of truth:** `VoiceAgentCallService.resolveCallerId` (+ spec),
  `VoiceAgentService.assertCallerNumberUsable` / `assertCallerNumberReady`

### AGENT-009 — Post-call analysis reaches Ringee on its own callback, or not at all

The summary, outcome, sentiment and extracted fields are produced provider-side
minutes after the conversation ends. There is **no endpoint to read a finished
conversation's analysis back** — so it is delivered or it is lost, and an
analysis group configured without a webhook analyses every call the agent makes
and tells nobody. That is not a theoretical failure: it is what an agent call
with an empty result looks like.

Ringee therefore owns the delivery. Every agent's analysis group is created
with its callback URL, and **re-pointed on every save**, which is the only
thing that recovers agents whose group predates the callback.

The route is `@Public()`, because the provider calls it. A group stores a bare
URL — no headers to set, no signature to pin — so the URL is the proof: a token
derived by HMAC from the agent id under a key scrypt'd from
`APP_ENCRYPTION_SECRET`, compared in constant time. Nothing is stored, so there
is no plaintext at rest and the URL survives every save. A verified token
proves _which agent_ asked for the analysis, never which call it may write to:
the conversation it names must belong to a call of that same agent.

- **Source of truth:** `voiceAgentInsightsToken` /
  `voiceAgentInsightsTokenMatches` (`@ringee/platform`),
  `VoiceAgentResultService.applyInsightCallback` (+ spec),
  `AiVoiceAgentWebhookController.handleInsights`

---

## Onboarding & lifecycle (`LIFE`)

### LIFE-001 — A Ringee user row is created by the Clerk webhook, repaired on first request

`ClerkAuthGuard.resolveRingeeUser` handles the race where Clerk redirects before
the `user.created` webhook lands, and de-duplicates concurrent syncs.

### LIFE-002 — Redis is an optimization for auth, never a dependency

Cache failures fall back to Postgres and Clerk with a warning; authentication
stays available.

### LIFE-003 — Soft-deleted rows stay queryable but are excluded from normal reads

`deletedAt` on contacts, tags, caller IDs and call sessions.
