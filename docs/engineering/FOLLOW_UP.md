# Persistent follow-up objectives

Stage 1, 3 November 2026. The pilot flag remains
`AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS`. This stage does not enroll human call
outcomes, provision agents on purchase, or move meetings by voice.

## Ownership and execution

`PendingActionService` and `PendingActionRepository` own the objective. An
optional `PendingActionFollowUp` child adds execution state without changing
`PendingActionStatus` or turning historical recommendations into automatic work.
`PendingAction.userId` is the commercially responsible member; the objective
separately records the configuring/calling user and authorized specialist.
`AiVoiceAgentHandoff` still owns the meeting conversation and its participants.
Its request status is a compatibility projection, not an independent lifecycle.

A new authorized Step 0 request calls `prepareFollowUpObjective`, then
`AiVoiceAgentHandoffRepository.createOnce` persists the handoff, initial
participation, pending action, objective and initial evidence in one transaction.
The workspace/source/version key and unique handoff relation deduplicate retries.
No existing pending actions or handoffs are backfilled.

`CallbackTask` is the execution record. Its optional `followUpId` links each
agreed or policy callback to the objective. A handoff on the source leg is not
another call. No new Temporal schedule exists: the existing callback tick
reconciles objectives, runs handoff recovery planning, then executes callbacks.
The objective reconciler also reviews paused and blocked cases, so a later
stored meeting change can resolve a case that previously needed attention.
Reviews are bounded and ordered by `reviewAt` so old blocked cases do not starve
new work.

Stage 2 extends the source authorization of
`PendingActionService.prepareFollowUpObjective` and uses the same transaction
helpers, objective, event history and callback execution. It must deliberately
wire eligible human dispositions and their revisions; no such caller exists in
Stage 1. Recommendations retain their own activation and execution mode.

## Lifecycle and evidence

States are scheduled, in progress, waiting, recovering, paused, blocked,
resolved and closed. Each nonterminal row has a scheduled next action, an active
execution, or an explicit waiting/paused/blocked reason; SQL checks enforce this.
`PendingActionFollowUpEvent` is append-only and deduplicated by objective/action
key. Source observations and control commands increment the objective revision;
stale reconciliation plans and stale control requests cannot overwrite them.
An unchanged reconciliation only moves its next review time; it does not append
progress or increment the revision. The final dispatch write checks its claim
token and current lease atomically even when a worker reclaims after validation.

Only a newer, active stored meeting at a different time proves that a
rescheduling objective was achieved. Its workspace, contact, version and time
are checked, and the evidence is rechecked under the meeting lock before the
resolution transaction commits. The evidence attributes success to the stored
meeting change, never invents an automatic resolution. A handoff, callback
placement, call completion, attendance decline or availability response resolves
nothing. Passing the original meeting time or cancelling that meeting alone
also resolves nothing.

Offered slots block the objective with `reschedule_commit_pending` once no call
is live and no callback is still to come: while the call that offered them is
on, the specialist may still move the meeting with `move_meeting`, and a callback
the person agreed to is the next step, as in the handoff's own review. Blocking
would settle the request under either and withdraw a promised callback.
An explicit human-support request is recorded separately, including whether
notification succeeded; a failed write is retried a few times within the tool
call, since until it lands the request's callbacks are not suspended. A later meeting
change can resolve either exception. Closure distinguishes refusal, objective
cancellation, expiration and exhausted contact attempts. No response is never
success and does not create a routine call for the salesperson.

The initial policy is stored per objective: three dispatched contact steps,
one policy recovery and seven days from enrollment. These are Stage 1 bounds,
not the full cadence proposed for later stages. Technical retries proved
unplaced retain their callback's contact-attempt number. Another callback or
specialist does not reset the objective's counters. The existing Step 0 recovery
planner still allows one recovery at the next allowed window at least an hour
after the previous call. Exhaustion closes the new objective without success;
legacy handoffs keep their previous `needs_attention` behavior.

## Dispatch, pause and recovery

Claims use the existing callback `FOR UPDATE SKIP LOCKED`, lease, fencing token,
dial reservation and stable `AiVoiceAgentCall.idempotencyKey`. A reclaimed step
looks up that call first. A confirmed leg is linked, an uncertain placement is
reconciled, and only a proven failure before placement can receive a new dial
try. Post-placement persistence remains outside dial rejection handling.

`commitFollowUpDispatch` is the dispatch commit point, after provider preparation
and immediately before the external call. It checks the claim/lease, objective
revision/mode/state/limits/expiry, active execution, current meeting/contact,
configured and responsible members, calling user, DNC, agent and automation.
The service also rechecks pilot access, language, calling window and overlapping
calls. The common voice-agent path rechecks its calling gates after preparation.
A database wait longer than 30 seconds invalidates the final window decision.

Lock order is meeting, automation, handoff, objective, callback; operations that
need only the last resources use that suffix. Controls and dispatch share the
objective lock. Pause, manual takeover, closure and resolution withdraw every
uncommitted step, including claimed steps in provider preparation. A committed
call can finish, append results and settle consumption. Its callback remains
recoverable even after the objective is paused or closed.

Resume revalidates the meeting (still `scheduled` or `rescheduled`),
membership, contact/DNC, specialist, calendar and remaining policy. It restores at most one uncommitted step, at a valid window at least an
hour in the future; other old steps stay withdrawn. The new time is policy
selected and represented as a recovery, never falsely described as agreed.
Manual takeover remains manual until `return_automatic` is explicitly requested.
Call settlement and history are never erased.

## API and visibility

The existing authenticated controller exposes:

- `GET /api/pending-actions/follow-ups`: bounded objective summaries, member
  scoping and optional state filter.
- `GET /api/pending-actions/:pendingActionId/follow-up`: summary, paged history,
  steps and authorized call consumption. `after` is an event cursor checked
  against its authorized objective.
- `POST /api/pending-actions/:pendingActionId/follow-up/control`: `operation`
  (`pause`, `resume`, `close`, `take_over`, `return_automatic`),
  `expectedRevision`, and a reason for pause/takeover/close. Close also requires
  `closureReason` (`refusal`, `cancelled`, `expired`, `attempts_exhausted`).

Services recheck current membership and administrative role. A member can
observe their commercially assigned objective but cannot read another member's
call metadata, transcript, recording or notes through it. Call costs are omitted
when those call rows are outside the reader's scope, with `costsRestricted` set.
History contains bounded structured evidence, not conversation transcripts.

The existing execution-center response adds an optional `followUp` summary;
the table labels its executor/state and suppresses legacy complete/dismiss/snooze
controls. Those generic service operations also reject objectives. “My day”
excludes objectives, and only blocked exceptions count toward the responsible
member's actionable badge. There is no new task center or dashboard redesign.

## Measurement and billing

Initiations, progress, recoveries and human interventions have stable event keys.
States and timestamps distinguish resolved from closed-without-success, pending
age, overdue steps, missing next actions and time to resolution. The source call
and callback calls are deduplicated by agent-call ID in detail reads. Existing
`Call.totalCost` and the AI cost debit marker provide consumption evidence;
unsettled or unknown costs are null, never zero by default. No tariff, ledger,
charge or participant-level allocation is added.

## Migration and validation

Ship the additive migration
`packages/database/prisma/migrations-pending/20261103120000_follow_up_objectives/migration.sql`
through the same deployment workflow selected for Step 0, before deploying the
new API/worker. It creates two child tables and three enums, adds nullable callback
columns, and adds lifecycle checks. Its callback foreign key lands `NOT VALID`. The
callback index `CallbackTask_followUpId_idx` and that key's validation run apart, by
hand with psql and autocommit, from
`packages/database/prisma/pending-migrations/20261103120100_follow_up_objectives_callback_indexes.sql`
(`CREATE INDEX CONCURRENTLY`, then `VALIDATE CONSTRAINT`), before the pilot is
enabled. It does not index or alter
`Call`, backfill recommendations, or run production migrations. Regenerate Prisma
and rebuild database/backend/orchestrator; deploy the small frontend projection
alongside them. Keep the pilot allowlist restricted.

`follow-up.postgres.spec.ts` opts in only through
`RINGEE_FOLLOWUP_TEST_DATABASE_URL`, and requires a local host. It exercises actual
repositories and services with mocked provider placement: duplicate Step 0
requests; concurrent claims and expired leases; stale workers; pause/takeover/
closure; committed-call completion after pause; restart after a failed placement
write; authoritative resolution; availability without success; window recalculation;
DNC, membership, agent and source-version gates; and workspace/member visibility.
`follow-up-policy.spec.ts` covers business-result evidence independently.

Use the orchestrator application context for DI validation; do not bootstrap the
backend or start its dial loops. Live provider interoperability, audio, real
callbacks and provider settlement remain pilot validation with explicitly
identified test contacts. Automated tests do not establish those facts.

Validation commands used for this delivery:

- `pnpm --filter @ringee/services run test` with
  `RINGEE_FOLLOWUP_TEST_DATABASE_URL` pointing only at disposable local Postgres
  (1,493 passed, including 22 follow-up policy/PostgreSQL tests).
- `pnpm --filter @ringee/database run test` with
  `RINGEE_AUTOMATION_TEST_DATABASE_URL` pointing at that same isolated database
  (73 passed, 2 unrelated opt-in tests skipped).
- `pnpm --filter @ringee/platform run test` (425 passed) and
  `pnpm --filter frontend run test` (32 passed).
- `pnpm prisma:generate`, `pnpm build:database`, `pnpm build:backend`,
  `pnpm build:orchestrator`, `pnpm build:frontend` and an orchestrator application
  context against disposable local Postgres/Redis. The frontend build required
  network access to fetch its existing Google Fonts.
- `pnpm lint` (zero errors; existing warning backlog), changed-file ESLint
  (no new warnings), `pnpm format:check`, and `git diff --check`.

No production database, Temporal worker, phone number or provider call was used
for these checks. Apply the migration to the deployed database before these
new reads or workers run; the generated Prisma client alone is insufficient.
