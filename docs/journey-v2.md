# Ringee Journey v2

Activation, adoption, retention and rewards for a Ringee workspace.

This document is the design record for the rewrite of the Journey module that
shipped on `feat/journey` (PR #52). It covers the behaviour that exists today,
the problems found while auditing it, the architecture that replaces it, the
exact metric definitions, the anti-fraud model, and the migration / rollout /
rollback plan.

---

## 1. Current behaviour (as audited on `feat/journey`)

### 1.1 Surface

| Layer | File | Notes |
| --- | --- | --- |
| Route | `apps/frontend/src/app/dashboard/journey/page.tsx` | Server component, `force-dynamic`, fetches `/journey/overview`. |
| Nav | `packages/frontend-shared/src/constants/data.ts` | "Journey" is the first item of the `General` group, shortcut `j j`, visible to everyone. |
| Controller | `apps/backend/src/api/routes/journey.controller.ts` | `GET /journey/overview` (open to all), `POST /journey/rewards/claim` (`@OrgAdminOnly()`). |
| Service | `packages/services/src/services/journey/journey.service.ts` | Builds the overview, derives reward state, performs the claim. |
| Stage rules (BE) | `packages/services/src/services/journey/journey-rewards.ts` | `classifyOrganization` / `classifyPersonal`, `JOURNEY_STAGE_REWARDS`. |
| Repository | `packages/database/src/database/repositories/journey.repository.ts` | One wide read-only snapshot (~40 queries in `Promise.all`). |
| Claim ledger | `packages/database/src/database/repositories/journey-reward.repository.ts` | `claimOnce` — create row + increment `Credit.amount` in one transaction. |
| Stage rules (FE) | `apps/frontend/src/features/journey/lib/journey.ts` | A second copy of `classifyOrganization` / `classifyPersonal`. |
| Requirement rules (FE) | `apps/frontend/src/features/journey/lib/rewards.ts` | A *third* copy of the thresholds, as the unlock checklist. |
| Model | `packages/database/prisma/schema.prisma` → `JourneyRewardClaim` | `amount Float`, `@@unique([organizationId, stageId])`, `@@unique([userId, stageId])`. |

### 1.2 How progress is computed today

`JourneyRepository.getSnapshot` reads a fixed rolling 30-day window and returns
counts for: numbers / caller IDs / SIP devices / memberships / rotation pool /
contacts; calls, "connected" calls, minutes, previous-window calls, active days,
active callers, calls by source; outcome counts, callbacks, meetings; campaign
totals; recording + transcription settings and counts, enabled AI pipelines;
and CRM / custom-integration / calendar / enrichment / MCP connection lists.

`classifyStage` then maps that to one of nine stage ids on one of two ladders,
and `buildRewards` marks every stage **at or below** the classified index as
`claimable`.

---

## 2. Problems identified

Ordered by severity. Every item below was verified by reading the code on
`feat/journey`, not inferred.

### P1 — Reaching a stage retro-unlocks every stage beneath it

`journey.service.ts::buildRewards` computes `reachedIndex = ladder.indexOf(stageId)`
and marks `index <= reachedIndex` as `claimable`. `classifyOrganization` returns
`ai_sales_team` on `aiSurface && calls >= 20` alone — with no team, no campaign,
no numbers. A workspace that flips on call recording and makes 20 calls is
immediately paid for `campaign_operator` **and** `ai_sales_team`
(`$3 + $10 = $13`) without ever creating a campaign. This is the single largest
economic hole in the current design.

### P2 — Toggles are treated as usage

`signalsFrom` sets `aiSurface = recordingEnabled || transcriptionEnabled ||
transcriptions > 0 || aiEnabled`. `recordingEnabled` is a boolean on
`CallRecordingSettings`; `aiEnabled` is `aiPipelinesEnabled > 0`, i.e. an
`AiPipelineActivation` row with `enabled: true`. Both are *settings*. No
transcript, no pipeline run, no persisted AI result is required. Similarly:
- `crmConnected` is `CrmConnection.status === 'active'` — an OAuth handshake, no sync.
- `calendarConnected` is `CalendarIntegration.isActive` — a connected calendar, no meeting pushed.
- `rotation` is `rotationPoolNumbers >= 2` — pool membership, not two caller IDs actually dialled.
- `teamMembers` counts `OrganizationMembership` rows, which include **pending invitations** (`clerkUserId` set, `userId` null). Inviting two e-mail addresses is enough for `small_team`.

### P3 — "Connected call" is disposition-only, and dispositions are user-entered

`UNCONNECTED_OUTCOMES = [no_answer, voicemail]`, and `connectedCalls` counts
`outcome NOT IN (...)`. A `NULL` outcome therefore counts as connected. In
Prisma, `{ outcome: { notIn: [...] } }` does **not** match `NULL` rows, so the
count is actually "calls with a non-null, non-machine outcome" — which is
exactly the [Call "answered" metric gotcha](../CLAUDE.md) convention used
elsewhere, but it means a user can manufacture connected calls by dialling an
unreachable number and hand-picking `interested` from the disposition menu.
`wrong_number` is not excluded. `answeredAt`, `endedAt`, `durationSeconds` and
`status` are never consulted. There is no minimum duration.

### P4 — Everything is a rolling 30-day window, including achievements

There is no persisted achievement. Reward state is recomputed from a 30-day
window on every request. A workspace that legitimately reached
`consistent_caller` in March and took April off drops back to `solo_caller`,
and the *reward it never claimed* silently disappears. Conversely `claimedAt`
is read from `JourneyRewardClaim.createdAt`, so a claimed reward survives — the
history is inconsistent between claimed and unclaimed rewards.

### P5 — Stage rules are duplicated three times

`journey-rewards.ts` (backend), `lib/journey.ts` (frontend classifier) and
`lib/rewards.ts` (frontend requirement checklist) each hard-code the same
thresholds, and both frontend files carry a comment saying "if a threshold
changes, change BOTH files". They already disagree in places (the FE checklist
for `call_center` lists SIP devices as a hard requirement; the BE classifier
also requires `calls >= 100`, which the checklist words differently). The
frontend is also a *second* place where a stage can be declared reached.

### P6 — The overview is readable by non-admins, and leaks org-wide inventory

`GET /journey/overview` has no `@OrgAdminOnly()`. `resolveMemberFilter` narrows
*activity* to the member, but `getFoundation`, `getIntelligence`,
`getIntegrations` and `getCampaigns` all use the raw ownership filter, so a
plain org member sees org-wide number counts, SIP devices, team size, campaign
totals, CRM/calendar/enrichment connections and the whole reward ladder
(including `claimableTotal`). The nav entry is shown to every role. The spec for
v2 requires the whole surface to be admin-only.

### P7 — The claim path trusts a stale, member-scoped read and pays outside the lock

`claimReward` calls `this.getOverview(ctx)` (a ~40-query read) and then
`claimOnce`. Between the read and the write nothing is re-validated. Worse, the
authorisation check is `item.status !== 'locked'` — derived from the very
snapshot P1 describes. Two admins racing are handled (the unique constraint
catches the second), but the loser gets `claimed: false` with a *rewritten*
`rewards` array that claims `status: 'claimed', claimedAt: now` — a fabricated
timestamp.

### P8 — No idempotency key, no program version, no audit trail

`JourneyRewardClaim` stores `stageId`, `amount Float`, `claimedByUserId`,
`createdAt`. There is no `programVersion`, so changing the ladder or the amounts
retroactively rewrites the meaning of every historical row and makes a second
payout for a renamed stage possible. There is no `idempotencyKey`, no
`balanceBefore` / `balanceAfter` (the rest of the codebase has these on
`CreditDebit`), no status, no risk fields, no rejection path, no reviewer.

### P9 — Money is `Float`, and there is no ledger row

`amount Float` on the claim; the credit is applied as
`credit.update({ amount: { increment: input.amount } })` with no corresponding
`CreditDebit`-style ledger entry, so a reward credit is invisible to any
balance reconciliation that reads the ledger.

### P10 — No anti-fraud, no budget, no rate limit

The claim endpoint has no rate limit (the repo has `RedisService.incrementWithExpiry`
and a working per-user/per-IP pattern in `stripe-abuse-protection.service.ts`
that is simply not used here), no per-workspace cap, no daily/monthly budget, no
circuit breaker, no manual-review path and no risk scoring. Creating N
organizations and claiming the ladder in each is unbounded free credit.

### P11 — `activeDays` uses server-local day boundaries

`countActiveDays` runs `date_trunc('day', c."startedAt")`. `startedAt` is
`timestamp(3)` (Prisma `DateTime` on PostgreSQL without `@db.Timestamptz`), so
`date_trunc` buckets by whatever the value's implicit zone is — effectively UTC
— for every workspace on earth. A workspace in `Asia/Tokyo` gets its day
boundary at 09:00 local. There is no workspace timezone stored anywhere in the
schema (`Contact.timezone` and `Company.timezone` exist; `Campaign.timezone`
exists for working hours; `User` and `Organization` have none).

### P12 — Frontend "claim all" loops the single-claim endpoint

`rewards-section.tsx` iterates claimable items and issues one POST per stage.

### P13 — Cost / performance

- `Call` has **no index on `startedAt`**, and every journey query filters
  `startedAt BETWEEN ...`. Indexes exist on `userId`, `organizationId`,
  `callControlId`, `callSessionId`, `fromNumber`, `toNumber`, `sipDeviceId`.
- `getSnapshot` issues ~40 queries per page load, uncached, on the post-login
  landing page.
- `getOverview` is called a second time inside `claimReward`.

### P14 — Hard-coded English, no i18n

Every string in `apps/frontend/src/features/journey/**` is an English literal,
including stage names, summaries and all coaching copy — in an app with ten
locales and a working `next-intl` namespace loader.

### P15 — No tests, no analytics events, no feature flag

There is no spec file anywhere under `journey/`, no product event is emitted,
and there is no flag to turn the program off. (Also found: `packages/services`
and `packages/database` contain `.spec.ts` files but **neither package has a
`test` script**, so those existing tests never run in CI.)

### P16 — `@ringee/platform` ↔ `@ringee/database` import cycle (pre-existing)

Found while wiring the missing test scripts, and worth recording even though it
is outside the Journey's scope. `@ringee/platform` imports runtime values from
`@ringee/database` (e.g. `EmailStatus` in
`packages/platform/src/auth/clerk/clerk.user.repository.ts`), while
`@ringee/database` imports `@ringee/platform` for `buildOwnershipFilter`. Under
`nest build` the compiled `dist` output tolerates this; under a source-level
runner it produces a TDZ error:

```
ReferenceError: Cannot access 'CreditRepository' before initialization
  at packages/database/src/database/database.module.ts
```

Effect: `packages/database/src/database/repositories/credit.repository.spec.ts`
cannot execute. It is the one pre-existing spec that still fails after the
runner was added. The Journey code deliberately avoids the cycle by importing
`OwnershipContext` type-only, so it is elided at compile time.

Recommended (separate change): move `buildOwnershipFilter` / `OwnershipContext`
into a leaf package, or have `@ringee/platform` import Prisma enums from
`@prisma/client` directly rather than through the `@ringee/database` barrel.

### P17 — Environment: root-owned build artifacts (pre-existing)

Not a code defect, but it blocks two of the repository's own checks in this
working copy:

- `node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**` is owned
  by `root`, so `prisma generate` fails with `EACCES`. The generated client is
  therefore stale and does not contain `JourneyStageAchievement`.
- `apps/backend/dist/**` and (previously) `apps/frontend/.next/**` are likewise
  root-owned, so `nest build` / `next build` cannot replace them.

Fix, once, from the repo root:

```bash
sudo chown -R "$(whoami)" node_modules apps/backend/dist
pnpm install && pnpm prisma:generate
```

---

## 3. Proposed architecture

### 3.1 One versioned program definition, evaluated server-side

```
packages/services/src/services/journey/
  program/
    journey.program.ts        # versioned ladders, stages, requirements, rewards
    journey.metrics.ts        # the metric keys + how each is described
    journey.capabilities.ts   # advanced-capability catalogue
    journey.hash.ts           # deterministic ruleHash over the active program
  journey.evaluator.ts        # pure: (metrics, program) -> stage states
  journey.predicates.ts       # pure: SQL-independent predicates + guards
  journey.risk.ts             # pure risk rules
  journey-risk.service.ts     # risk scoring (needs DB/Redis)
  journey-budget.service.ts   # budgets, circuit breaker, rate limits (Redis)
  journey-claim.service.ts    # the claim state machine
  journey-analytics.port.ts   # provider-agnostic event sink
  journey.service.ts          # orchestration + DTO assembly
```

A **stage** is data, not code:

```ts
{
  id: 'consistent_caller',
  order: 2,
  rewardCents: 300,
  requirements: [
    { id: 'connected_calls', metric: 'connectedCalls',   target: 15 },
    { id: 'active_days',     metric: 'activeDays',       target: 4  },
    { id: 'destinations',    metric: 'uniqueDestinations',target: 10 },
    { id: 'connected_min',   metric: 'connectedMinutes', target: 20 },
  ],
}
```

Requirements read from a **flat numeric metric bag** (`JourneyMetrics`), so
evaluation is a pure fold with no branching per stage. Booleans are 0/1. The
API returns, per stage, `{ id, order, status, rewardCents, requirements: [{ id,
metric, target, current, done }] }`. The frontend maps `id` → i18n label, icon
and deep link, and renders. **No thresholds exist in the frontend.**

### 3.2 Sequential evaluation

The evaluator walks the ladder in order and stops at the first stage whose
requirements are not all met. `reachedOrder` is therefore, by construction,
"every stage up to here was independently satisfied". Stages after the first
unmet one are `locked` regardless of their own metrics.

### 3.3 Three separate persisted concepts

| Concept | Table | Meaning |
| --- | --- | --- |
| Progress | *(none — computed)* | Live metrics for the active window. |
| Achievement | `JourneyStageAchievement` | Immutable: this workspace satisfied this stage of this program version, at this instant, under this `ruleHash`, with this metric snapshot. Never revoked by a quieter window. |
| Reward | `JourneyRewardClaim` | The money. Own status machine, own risk fields, own idempotency key, own balance stamps. |

An achievement is written the first time the evaluator sees the stage satisfied
(on any read — the overview persists achievements as a side effect, in stage
order, inside one transaction). Reward eligibility reads achievements, not the
live window: **a reward earned is a reward kept.**

### 3.4 Money

All new monetary values are integer **cents**. The single conversion to the
legacy `Credit.amount Float` happens in one place
(`JourneyRewardClaimRepository.settle`) as `cents / 100`, guarded by a precision
test. A `CreditDebit`-shaped ledger row is written for every reward so balance
reconciliation sees it (`source: 'journey_reward'`, negative-of-a-negative:
`amount` positive = credit).

### 3.5 Timezone

`User.timezone` and `Organization.timezone` (nullable IANA strings) are added.
Day/week bucketing uses `date_trunc('day', c."startedAt" AT TIME ZONE $tz)`.
Fallback is `UTC`. Invalid IANA values are rejected at the boundary and fall
back to UTC rather than throwing.

---

## 4. Exact metric definitions

All metrics are computed **workspace-wide** (never member-scoped — the Journey
is a workspace object) over the **program window** (default: since workspace
creation, capped at `JOURNEY_WINDOW_DAYS`, default 90) unless stated otherwise.

### 4.1 Call predicates

```
attemptedCall(c) :=
      c belongs to the workspace
  AND c.direction = 'outbound' (or NULL, treated as outbound — legacy rows)
  AND c.startedAt IS NOT NULL
  AND c.toNumber is a valid E.164 destination
  AND c.toNumber ∉ workspace-owned numbers      (self-dialling excluded)
  AND c.toNumber ∉ JOURNEY_TEST_DESTINATIONS    (configurable QA list)
  AND c.status ∉ (pending)                       (never left the queue)
```

```
connectedCall(c) :=
      attemptedCall(c)
  AND c.answeredAt IS NOT NULL
  AND c.endedAt   IS NOT NULL
  AND c.status IN (completed, recording, answered)
  AND c.durationSeconds >= JOURNEY_MIN_CONNECTED_SECONDS   (default 20)
  AND c.outcome ∉ (no_answer, voicemail, wrong_number)
  AND c.providerCallId IS NOT NULL                  (provider-acknowledged)
```

`providerCallId` is `@unique` in the schema, which is what makes duplicate
provider rows impossible to double-count.

```
meaningfulConversation(c) :=
      connectedCall(c)
  AND (
        c.durationSeconds >= JOURNEY_MEANINGFUL_SECONDS    (default 60)
     OR  c has a completed CallTranscription with non-empty text
     OR  c produced a Meeting, CallbackTask or CrmCallSync(done)
      )
```

The disposition alone is never sufficient — that is the point of the third
clause: *operational evidence* (a booked meeting, a synced activity, a
transcript) outranks a hand-picked dropdown value.

### 4.2 Metric bag

| Key | Definition |
| --- | --- |
| `verifiedPhone` | `User.phoneVerified` for the claiming admin (0/1). |
| `dialableNumbers` | `NumberPurchased` rows, `deletedAt IS NULL`, `kind='purchased'` **or** (`kind='verified_caller_id'` and `verified`). |
| `attemptedCalls` | `count(*) where attemptedCall` |
| `connectedCalls` | `count(*) where connectedCall` |
| `meaningfulConversations` | `count(*) where meaningfulConversation` |
| `connectedMinutes` | `floor(sum(durationSeconds where connectedCall) / 60)` |
| `billableMinutes` | `floor(sum(durationSeconds where connectedCall AND totalCost > 0) / 60)` |
| `uniqueDestinations` | `count(distinct normalized_e164(toNumber)) where connectedCall` |
| `activeDays` | `count(distinct date_trunc('day', startedAt AT TIME ZONE tz)) where connectedCall` |
| `activeWeeks` | `count(distinct date_trunc('week', startedAt AT TIME ZONE tz)) where connectedCall` |
| `activeMembers` | `count(distinct userId) where connectedCall AND userId IS NOT NULL` |
| `acceptedMembers` | `OrganizationMembership` with `userId IS NOT NULL` (invitations excluded) |
| `callSources` | `count(distinct coalesce(source,'web')) where connectedCall` |
| `outcomesLogged` | `count(*) where connectedCall AND outcome IS NOT NULL` |
| `campaignConnectedCalls` | `connectedCall` joined through `CallAttempt.campaignId` |
| `campaignUniqueDestinations` | distinct destinations among campaign connected calls |
| `campaignActiveDays` | distinct local days among campaign connected calls |
| `campaignsWithRealActivity` | campaigns with ≥`JOURNEY_CAMPAIGN_MIN_CALLS` connected calls **and** ≥2 distinct destinations **and** ≥2 distinct local days (kills the single-burst campaign) |
| `workedLeads` | `count(distinct campaignLeadId)` on `CallAttempt` whose `callId` is a connected call |
| `callbacksWorked` | `CallbackTask` rows created in-window whose contact later has a connected call *after* the callback's creation |
| `meetingsSynced` | `Meeting` with `externalEventId IS NOT NULL` |
| `crmSyncedCalls` | `CrmCallSync` with `status='done'` whose `callId` is a connected call |
| `customIntegrationDeliveries` | `CustomIntegrationDelivery` rows with a success status |
| `transcriptionsCompleted` | `CallTranscription` with `status='completed'` and non-empty `text`, whose `callId` is a connected call |
| `aiResultsProduced` | `AiPipelineRun` with `status='succeeded'` **and** a persisted result (`PendingAction` / `ObjectionInsight` row for the same `contextKey`) |
| `aiMembersCovered` | distinct `userId` among calls that produced an AI result |
| `mcpSessions` | `CallSession` with `source='mcp'`, `deletedAt IS NULL` |
| `mcpCalls` | connected calls linked to an MCP-created session |
| `rotationCallerIdsUsed` | `count(distinct callerIdId) where connectedCall AND callerIdId IS NOT NULL` |
| `sipDeviceCalls` / `sdkCalls` / `extensionCalls` / `callSessionCalls` | connected calls by `source` |
| `enrichmentImports` | `EnrichmentJob` rows that produced a `Contact` |
| `advancedCapabilitiesUsed` | size of the set in §4.3 |

### 4.3 Advanced capabilities

A capability counts as **used** only when its usage metric clears its own floor.
This is what lets a digital call-centre finish the ladder without ever touching
SIP.

| Capability | Used when |
| --- | --- |
| `campaigns` | `campaignsWithRealActivity >= 1` |
| `crm` | `crmSyncedCalls >= 5` |
| `custom_integration` | `customIntegrationDeliveries >= 5` |
| `ai` | `aiResultsProduced >= 1 AND transcriptionsCompleted >= 5` |
| `mcp` | `mcpCalls >= 3` |
| `calendar` | `meetingsSynced >= 2` |
| `caller_id_rotation` | `rotationCallerIdsUsed >= 2` |
| `sip` | `sipDeviceCalls >= 5` |
| `sdk` | `sdkCalls >= 5` |
| `extension` | `extensionCalls >= 5` |
| `call_sessions` | `callSessionCalls >= 5` |
| `enrichment` | `enrichmentImports >= 10` |

---

## 5. Stage ladders (program version `2026.08`)

Amounts in USD cents. Stage 1 pays nothing on both ladders by design — the
first-value moment should not be purchasable.

### Personal workspace

| # | Stage | Requirements | Reward |
| --- | --- | --- | --- |
| 1 | `foundation` | `verifiedPhone≥1`, `dialableNumbers≥1`, `connectedCalls≥1` | — |
| 2 | `consistent_caller` | `connectedCalls≥15`, `activeDays≥4`, `uniqueDestinations≥10`, `connectedMinutes≥20` | 300 |
| 3 | `connected_operator` | `integrationSuccesses≥5`, `connectedCalls≥25`, `outcomesLogged≥10` | 500 |
| 4 | `ai_closer` | `transcriptionsCompleted≥10`, `aiResultsProduced≥1`, `connectedCalls≥40`, `activeWeeks≥2` | 500 |
| 5 | `agentic_operator` | `mcpCalls≥5`, `activeWeeks≥3`, `advancedCapabilitiesUsed≥3`, `meaningfulConversations≥25` | 700 |

Total: **$20.00**

### Organization workspace

| # | Stage | Requirements | Reward |
| --- | --- | --- | --- |
| 1 | `workspace_ready` | `verifiedPhone≥1`, `dialableNumbers≥1`, `connectedCalls≥1` | — |
| 2 | `team_activated` | `acceptedMembers≥2`, `activeMembers≥2`, `connectedCalls≥25`, `activeDays≥5` | 300 |
| 3 | `campaign_operator` | `campaignConnectedCalls≥25`, `campaignUniqueDestinations≥15`, `campaignActiveDays≥3`, `workedLeads≥20`, `outcomesLogged≥15` | 500 |
| 4 | `connected_sales_operation` | `integrationSuccesses≥15`, `connectedCalls≥60`, `meaningfulConversations≥20` | 700 |
| 5 | `ai_sales_team` | `transcriptionsCompleted≥25`, `aiResultsProduced≥2`, `aiMembersCovered≥2`, `connectedCalls≥100` | 1000 |
| 6 | `advanced_operation` | `activeWeeks≥4`, `activeMembers≥3`, `campaignsWithRealActivity≥2`, `meaningfulConversations≥100`, `advancedCapabilitiesUsed≥3` | 1200 |

Total: **$37.00**

`integrationSuccesses := crmSyncedCalls + customIntegrationDeliveries + meetingsSynced`.

> **These thresholds are provisional.** They are conservative first guesses, not
> data-validated values. `pnpm journey:analyze` (§8) exists to calibrate them
> against production history; until that has been run against real data, no
> statement in this repository should claim these numbers are validated.

---

## 6. Anti-fraud model

Rate limiting is *not* anti-fraud. Both exist, separately.

### 6.1 Rate limits (reuses the Redis pattern from `stripe-abuse-protection.service.ts`)

| Scope | Key | Default |
| --- | --- | --- |
| per user | `ringee:journey:rl:user:{userId}` | 10 / 10 min |
| per workspace | `ringee:journey:rl:ws:{type}:{id}` | 10 / 10 min |
| per action (claim) | `ringee:journey:rl:claim:{workspace}` | 6 / hour |

### 6.2 Risk signals

Each rule contributes points and a stable reason code. Only signals Ringee
legitimately has are used; PII is hashed (SHA-256, truncated) before it enters a
snapshot.

| Code | Points | Signal |
| --- | --- | --- |
| `account_too_new` | 30 | user younger than `JOURNEY_MIN_ACCOUNT_AGE_HOURS` (default 24) |
| `workspace_too_new` | 20 | organization younger than the same threshold |
| `email_unverified` | 20 | no `UserEmail` with `status = verified` |
| `phone_unverified` | 25 | `User.phoneVerified = false` |
| `user_blocked` | 100 | `User.blockedAt IS NOT NULL` |
| `shared_phone` | 35 | the same `phoneNumber` hash appears on >1 user |
| `shared_payment_method` | 30 | the same Stripe `customerId` backs >1 workspace |
| `related_workspaces` | 25 | the claiming admin is an accepted member of >`JOURNEY_MAX_REWARDED_WORKSPACES_PER_USER` rewarded workspaces |
| `workspace_burst` | 25 | >3 organizations created by this user in 7 days |
| `claim_too_fast` | 20 | first claim < `JOURNEY_MIN_ACCOUNT_AGE_HOURS` after signup |
| `high_failure_rate` | 20 | `failedCalls / attemptedCalls > 0.6` with ≥20 attempts |
| `short_call_flood` | 25 | >70 % of attempted calls under 10 s with ≥20 attempts |
| `destination_repetition` | 25 | top destination is >50 % of connected calls with ≥10 connected |
| `self_dialing` | 30 | ≥1 connected call to a workspace-owned number (these are already excluded from metrics; their *presence* is the signal) |
| `expensive_destinations` | 20 | >40 % of connected minutes on the highest-rate decile of `TelnyxRatePerMinute` |
| `time_compression` | 25 | ≥80 % of connected calls inside a 30-minute span |
| `locked_stage_probing` | 15 | ≥5 rejected claims for not-yet-reached stages in 24 h |
| `payment_failures` | 15 | an active Stripe-abuse block for this user |

### 6.3 Bands and behaviour

| Band | Score | Behaviour |
| --- | --- | --- |
| `low` | `< 30` | auto-approve (if `JOURNEY_AUTO_APPROVE_ENABLED`) |
| `medium` | `30–69` | `pending_review` — achievement kept, no money moves |
| `high` | `>= 70` | `rejected` with a neutral message; claim row retained for audit |

The client never receives `riskScore`, `riskBand` or reason codes. It receives a
status and a non-accusatory message key.

### 6.4 Budgets and circuit breaker

- `JOURNEY_DAILY_BUDGET_CENTS`, `JOURNEY_MONTHLY_BUDGET_CENTS` — Redis counters
  (`ringee:journey:budget:day:{YYYY-MM-DD}`, `…:month:{YYYY-MM}`), reconciled
  against `sum(amountCents)` of `claimed` rows on cold start.
- `JOURNEY_MAX_TOTAL_CENTS_PER_WORKSPACE` — hard cap per workspace per program version.
- `JOURNEY_REWARDS_ENABLED=false` — the circuit breaker: reads keep working,
  achievements keep being recorded, no claim is accepted.
- `JOURNEY_DRY_RUN=true` — claims are evaluated, risk-scored and logged, and
  return `pending_review`, but no money moves.

### 6.5 Review path

`/backoffice/journey` (super-admin only, existing `SuperAdminOnly` guard) lists
`pending_review` claims with their risk reasons and offers approve / reject with
a mandatory note; the decision is stamped with `approvedByUserId` /
`rejectedAt` / `rejectionReason`. Approval performs the same transactional
settle as an auto-approved claim.

---

## 7. Claim flow

```
authenticate (ClerkAuthGuard)
  → resolve workspace (createOwnershipContext)
  → require admin (OrgAdminGuard; freelancer = own admin)
  → rate limit (Redis buckets)
  → feature flags (JOURNEY_V2_ENABLED, JOURNEY_REWARDS_ENABLED)
  → load active program version
  → fresh metric snapshot (no cache)
  → persist achievements for every newly satisfied stage, in order
  → require achievement for the requested stage AND for its predecessor
  → risk evaluation
  → budget + per-workspace cap check
  → ONE transaction:
        insert JourneyRewardClaim (idempotencyKey unique)
        read balance  → balanceBefore
        increment Credit.amount by cents/100
        insert ledger row
        stamp balanceAfter, status='claimed', claimedAt
  → emit analytics AFTER commit
  → return the idempotent result
```

`idempotencyKey = journey:{workspaceType}:{workspaceId}:{programVersion}:{stageId}`.

A duplicate insert (`P2002`) re-reads the existing row and returns **its** real
status and timestamps — never a fabricated one.

`POST /journey/rewards/claim-all` is a single server-driven endpoint that walks
the ladder in order and settles each eligible stage with its own idempotency
key, returning one aggregate result. The frontend never loops.

---

## 8. Historical calibration — `pnpm journey:analyze`

A read-only script (`packages/database/scripts/journey-analyze.ts`) that opens a
Prisma client, runs only `SELECT`s, and prints a report with **no PII**.

```
pnpm journey:analyze \
  --from 2026-01-01 --to 2026-08-01 \
  --workspace-type organization|personal|all \
  --cohort 2026-Q1 \
  --rule-version 2026.08 \
  --format table|json|csv \
  --dry-run
```

Output: per-metric distributions (p25/p50/p75/p90/p95), share of workspaces that
would reach each stage, mean/median time-to-stage, stage-to-stage drop-off,
total credit that would have been granted, estimated wholesale cost of that
credit, revenue produced by those workspaces, reward-to-revenue ratio, and
reached-vs-not-reached retention comparison (D7/D30/D60) with sample sizes and
Wilson confidence intervals.

**Status: implemented, not yet run against production.** This environment has no
production database. Fixture mode (`--fixtures`) runs the same pipeline over a
synthetic dataset so the code path is exercised in CI. Any threshold in §5 that
this script has not yet validated is flagged as provisional in
`journey.program.ts`.

---

## 9. Rollout

Cohort assignment is a stable hash of the workspace id
(`sha256(workspaceType:workspaceId) mod 100`), so a workspace never flips
buckets.

1. `JOURNEY_V2_ENABLED=true`, `JOURNEY_REWARDS_ENABLED=false` — evaluation and
   achievements only, no UI change. Verify metric sanity in logs.
2. Dark launch: UI behind `JOURNEY_ROLLOUT_PERCENT=0` plus an internal
   allowlist; rewards still off.
3. Internal admins (`JOURNEY_INTERNAL_USER_IDS`).
4. `JOURNEY_ROLLOUT_PERCENT=10` with `JOURNEY_REWARDS_ENABLED=true`,
   `JOURNEY_AUTO_APPROVE_ENABLED=false` (everything goes to manual review).
5. 25 % → auto-approve for `low` band only.
6. 50 %, then 100 %.

`JOURNEY_HOLDOUT_PERCENT` (default 5) carves a stable holdout that sees the
Journey but is never offered rewards, so reward-driven lift can be measured
against participation-driven lift.

---

## 10. Success metrics

| Metric | Definition |
| --- | --- |
| Time to first value | signup → first `connectedCall` |
| Activation | % workspaces reaching stage 1 within 7 days |
| Stage conversion | % reaching stage *n* among those that reached *n-1* |
| Requirement drop-off | for each stage, which requirement is most often the last unmet |
| Product retention D7/D30/D60 | ≥1 connected call in the window |
| Commercial retention D30/D60 | ≥1 successful credit purchase or active subscription |
| Advanced adoption | % with `advancedCapabilitiesUsed ≥ 3` |
| Reward cost per retained workspace | granted cents / D30-retained workspaces |
| Incremental revenue vs holdout | revenue(treated) − revenue(holdout), with CI |
| Reward credit consumed | granted cents actually spent on calls |
| Fraud caught / false positives | `rejected` and `pending_review→approved` counts |

---

## 11. Migration strategy

1. `migrations-pending/20260805090000_journey_v2/migration.sql` (repo convention:
   SQL is authored by hand under `migrations-pending/`, applied with
   `prisma migrate deploy` / `db push` per environment).
2. `JourneyStageAchievement` created new.
3. `JourneyRewardClaim` is **altered, not dropped**:
   - add `programVersion` (default `'1'` for existing rows), `amountCents`
     (backfilled `round(amount*100)`), `currency`, `status` (backfilled
     `'claimed'`), `idempotencyKey` (backfilled from the legacy tuple),
     `riskScore`/`riskBand`/`riskReasons`, `eligibilitySnapshot`,
     `metricsSnapshot`, `balanceBefore`/`balanceAfter`, `claimedAt`
     (backfilled `createdAt`), review columns, `updatedAt`.
   - drop the two partial uniques, add `UNIQUE(idempotencyKey)` plus
     `UNIQUE(userId, programVersion, stageId)` /
     `UNIQUE(organizationId, programVersion, stageId)`.
   - add `CHECK ((userId IS NULL) <> (organizationId IS NULL))` to both tables.
4. A backfill achievement is written for every legacy claimed stage so a v1
   claimant is never asked to re-earn a stage they were already paid for.
5. `User.timezone` / `Organization.timezone` added, nullable.
6. `Call(organizationId, startedAt)` and `Call(userId, startedAt)` indexes added
   (`CREATE INDEX CONCURRENTLY` in the production runbook).

**Rollback:** `JOURNEY_V2_ENABLED=false` stops all new evaluation and claims
immediately, without touching data. The SQL down-migration is provided but is
*not* the rollback path for an incident — the flag is.

---

## 12. Known risks

1. **Thresholds are unvalidated.** They are conservative but arbitrary until
   `journey:analyze` runs on production data. Too strict → the program does
   nothing; too loose → it pays for noise.
2. **`connectedCall` depends on `answeredAt`/`durationSeconds` fidelity.**
   Fake answer supervision from some carriers stamps `answeredAt`. The 20 s
   floor plus the `meaningfulConversation` evidence clause mitigate this but do
   not eliminate it.
3. **Determined multi-account abuse remains possible.** Risk signals raise the
   cost; they do not make it impossible. The per-workspace cap, the daily budget
   and the circuit breaker bound the damage.
4. **`aiResultsProduced` depends on pipeline schedules**, so a workspace can
   satisfy every input condition and still wait for the next run. The UI must
   say "processing", not "not done".
5. **Cost of the metric queries.** Even with the new indexes, `COUNT(DISTINCT …)`
   over a 90-day window is not free. The overview is cached 60 s per workspace;
   the claim path always recomputes.
6. **Legacy v1 claims** were paid under P1 semantics. They are honoured, not
   clawed back. `programVersion='1'` marks them so the analysis script can
   exclude them from v2 economics.
