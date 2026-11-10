# Persistent follow-up objectives

Stages 1–3, updated 6 November 2026; Stage 4A (personal workspaces), 10
November 2026. The pilot flags are `AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS` for
organizations and `AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS` for personal
workspaces (explicit owner ids). Human-outcome enrollment additionally requires
an explicit scheduling-automation policy authorized by an administrator — in a
personal workspace, its owner. Purchasing Organization does not enable it.

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

Step 0 reschedule handoffs and newly saved eligible human outcomes can enroll
objectives. Recommendations retain their own activation and execution mode.
See [PLAN_ORGANIZATION_AI_FOLLOWUP.md](../product/PLAN_ORGANIZATION_AI_FOLLOWUP.md)
§17–19 for implementation status.

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

Offered slots are progress. With no live call or agreed callback, an objective
retains bounded specialist recovery; legacy handoffs without an objective keep
their prior exception behavior. An agreed callback never resolves the request.
An explicit human-support request is recorded separately, including whether
notification succeeded; a failed write is retried a few times within the tool
call, since until it lands the request's callbacks are not suspended. A later meeting
change can resolve either exception. Closure distinguishes refusal, objective
cancellation, expiration and exhausted contact attempts. No response is never
success and does not create a routine call for the salesperson.

The policy is stored per objective: new objectives allow three dispatched contact
steps, two policy recoveries and seven days from enrollment. Existing limits are
not rewritten. Unpromised human follow-up starts the next calendar day in an
allowed window; no-answer recovery waits at least 24 hours. An interrupted
conversation waits at least 60 minutes. Technical retries proved unplaced retain
the contact-attempt number. Another callback or specialist does not reset counters.
A shared contact row lock coordinates objective callbacks and reminder dispatch,
reserving one active automatic conversation and at most two automatic calls in
the calendar-local day. A stored agreed callback is an explicit daily-cap exception,
never an exception to active-call exclusion; so is a person's "Confirm now". A
committed try the provider refused before any leg existed uses none of the day's
calls. Exhaustion closes without success.

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

Lock order is meeting, contact (when reserving dispatch), automation, handoff,
objective, callback; operations that
need only the last resources use that suffix. Controls and dispatch share the
objective lock. Pause, manual takeover, closure and resolution withdraw every
uncommitted step, including claimed steps in provider preparation. A committed
call can finish, append results and settle consumption. Its callback remains
recoverable even after the objective is paused or closed.

Resume revalidates the original meeting (including one eligible for replacement),
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

## Stage 2: human-outcome assignment

`MeetingService.updateCallOutcome` and `CallAttemptService.submitDisposition`
call `PendingActionService.recordHumanOutcome`. Canonical outcomes, not editable
labels, determine eligibility. `CallRepository.recordOutcome` locks the contact
and source call and persists the semantic `outcomeRevision`, commitment,
objective, first callback and initiation evidence in one transaction. Unrelated
call updates and identical saves do not advance that revision. Campaign wrap-up
waits for acceptance; its disposition snapshot is fenced by the accepted source
revision. Retries can finish wrap-up without another objective or callback.

Enrollment requires the pilot and `appointment_booking.settings.humanFollowUp`
with `enabled: true`. The existing scheduling setup accepts `humanFollowUpEnabled`
and `interestedObjective` (`booking` or `information`); only a current admin can
explicitly authorize the policy. Older requests that omit it preserve its value.
The existing setup form defaults the opt-in off. No historical recommendation or
unchanged historical call is enrolled, and AI-origin calls cannot recursively
enroll work. No-answer and voicemail remain human prospecting.

Interested produces a booking objective only when that policy specifies booking.
Follow-up and callback commitments preserve purpose, note, instant and IANA time
zone. Existing manual callbacks linked to the source supply the committed date
for older clients. A missing callback date is rejected. An unspecified agreed
purpose is conservatively informational, never silently converted to booking.
Information objectives are stored as blocked with
`information_follow_up_not_supported`. Missing specialist, caller ID, calendar,
contact details, disabled automation or an unusable time also produce a visible
blocked objective and a non-dispatchable stored step.

Human booking objectives start with **no meeting and no handoff**. Policy,
controls and the existing callback worker handle this source explicitly. The
server selects the configured specialist, caller ID, calendar and responsible
member; the agent's existing language/company configuration remains authoritative.
Policy timing is labelled policy-selected. Agreed timing is retained; a missed
agreement is blocked rather than presented as a new promise. Resuming a human
objective retains a still-future agreed callback; otherwise it selects a new
window at least one hour ahead and labels it policy-selected. Repairing specialist
configuration can explicitly resume a blocked booking objective.

Corrections withdraw uncommitted work and advance the source fence. Pauses,
closures and manual takeover survive repeated and corrected saves. Refusal,
stop, wrong number and sale close obsolete contact objectives; an explicit stop
also writes DNC. Source corrections and dispatch share contact/source locks;
controls share the objective lock. Human dispatch rechecks policy, source
revision, ownership, membership, DNC, contact changes, calendar, agent, claim,
lease and bounds. The common voice-agent path retains balance/calling gates and
stable placement reconciliation. Campaign claims lock the contact and exclude
active objectives; final dispatch also rejects a contact assigned to an active
campaign caller. Human recommendation/list queues exclude assigned contacts,
including blocked or paused objectives. Only this source's manual callback is
transferred; unrelated historical commitments are not converted.

`MeetingRepository.createIfAvailable` binds the actual successful reservation to
the exact dispatched callback, objective, source revision, agent call, contact,
workspace and pinned calendar. It records `stored_authorized_booking` evidence
and resolves in the same reservation transaction. An unrelated meeting, completed
call, transcript inference or offered availability cannot resolve a human booking
objective. Existing availability and booking tools are reused. Reminder planning
uses only an existing enabled calendar policy; context forbids claiming a
confirmation call when none exists. Autonomous rescheduling/cancellation is not
part of this enrollment delivery.

The post-call and campaign controls show preparing while saving, then accepted,
blocked or stopped from the durable response, with objective and next action.
No second form or call-to-schedule button is introduced. REST and shared dialer
contracts add an optional `followUp` field; older consumers can ignore it. The
extension preserves that response. Member-scoped reads and controls are unchanged.

### Stage 2 deployment and verification

After Stage 0/1 schema and SQL-only index/check prerequisites, deploy
`packages/database/prisma/migrations-pending/20261103140000_human_outcome_follow_up/migration.sql`
using the same pending-migration workflow. It adds `CallbackAgentKind.policy`,
semantic outcome fields on `Call`, the callback source revision, and nullable
objective policy/calendar/commitment fields. It builds no index on `Call` and
performs no historical enrollment. Regenerate Prisma; deploy API, worker and UI;
then enable the explicit policy only in the restricted pilot.

`human-follow-up.postgres.spec.ts` starts each primary source with one authorized
human call/contact and zero meetings/handoffs. It covers manual and campaign
acceptance, simultaneous saves, semantic revisions, queue exclusion, committed
and uncommitted correction fences, blocked configuration and repair, timing,
manual takeover, exact reservation evidence, isolation, authenticated audit actors
and uncertain placement. The two PostgreSQL worker suites share a test-only
transaction advisory lock: worker claims intentionally span workspaces, so test
files must not steal each other's fixtures. Competing-worker and request tests
remain concurrent within each suite. It uses the same local-only `RINGEE_FOLLOWUP_TEST_DATABASE_URL` opt-in as Stage 1.
No real calls or production migrations were performed. Live provider validation
still requires named test contacts and an expressly authorized pilot organization.

CI starts PostgreSQL 16 with an empty `ringee_followup_test` database. Before the
Test step it runs:

```bash
FOLLOWUP_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ringee_followup_test \
  node packages/services/test/prepare-follow-up-database.mjs
```

The test-only script refuses nonlocal, differently named or nonempty databases.
It derives the schema preceding follow-up from the current Prisma schema, adds
the SQL-only DNC partial indexes, then applies the actual Stage 1 migration,
callback index/foreign-key validation and Stage 2/3 migrations. This includes the
lifecycle checks that `prisma db push` omits. The generated baseline already
includes the Step 0 callback uniqueness indexes. The Test step alone receives
`RINGEE_FOLLOWUP_TEST_DATABASE_URL` pointing at this prepared database, so both
PostgreSQL suites execute in CI. Each suite enforces a ten-minute timeout;
the shared advisory-lock transaction allows twenty-one minutes, covering a
competing suite and the full bounded run. Providers remain mocked.

For bounded local test concurrency, put `--test-concurrency=2` before the
`src/**/*.spec.ts` pattern in the package's `node --test` command. Appending it
with `pnpm run test --test-concurrency=2` places it after the pattern and does
not limit the test runner's workers.

Stage 2 verification (4 November 2026):

- Full services suite: 1,556 passed, zero failures or skipped tests, using
  `pnpm --filter @ringee/services run test --test-concurrency=2` with both
  `DATABASE_URL` and `RINGEE_FOLLOWUP_TEST_DATABASE_URL` explicitly set to the
  disposable local database.
- Both PostgreSQL follow-up suites together: 36 passed, including 13 Stage 2 cases.
  The disposable database included the SQL-only lifecycle checks and DNC indexes.
- Database suite: 73 passed, 2 unrelated opt-in suites skipped. Booking and meeting
  automation concurrency tests used explicit local database URLs.
- Platform: 426 passed; browser extension: 73 passed; frontend: 32 passed.
- Prisma generation, database/backend/orchestrator/frontend builds, dialer UI and
  extension typechecks passed. Orchestrator DI resolved against disposable
  PostgreSQL with an inert Redis transport; no worker or dial loops were started.
- Repository ESLint: zero errors, existing warning backlog only. Repository
  Prettier check and diff whitespace checks passed; final changed-file lint added
  no warnings.
- Stage 2 SQL applied to a separate disposable database constructed from the
  preceding Stage 1 schema; Prisma schema comparison reported no difference.

## Stage 3: authoritative resolution and receipts

The Stage 2 path is present on `main`: human outcome → semantic source revision →
objective → dispatched callback → exact reservation. Stage 3 extends those owners;
it does not create a second task scheduler or enable organization provisioning.

`MeetingRepository` commits a `MeetingAutomationAction`, an attributed contact
note and receipt obligations with each definitive tool result. Call detail exposes
stable action IDs through `automationActions`, under existing member scope. Notes
carry `actorType`, `agentId` and `automationActionId`; replay never overwrites or
recreates a human-edited/deleted note. Actions retain the meeting/version, old and
new time, call, acting agent, request/objective/execution and actual decision.
Analysis is supplementary and conditionally cannot overwrite tool-backed outcomes.
Existing objective events and authorized call-cost reads supply recoveries,
closure, interventions, resolution time and settled/unknown cost without another
usage ledger. Replacement and attendance intent are distinct result kinds; neither
implies a new prospect booking, sale, actual attendance or no-show.

The existing `move_meeting` tool requires `time_confirmed: true`, an offered time
from that live participation, and a fresh slot/capacity/version check. A future
modifiable meeting moves in place. A still-open objective may replace its past or
cancelled original once per request, preserving it through `replacesMeetingId`.
Replay reads the stored action; matching a human edit to the proposed time is not
AI success. A human edit after the action is reported as changed. Participation
activation and meeting writes share the meeting-before-handoff lock order.

`confirm_meeting_attendance` records the current version. Intermediate decline
creates history immediately and no final rejection email. `finish_meeting_response`
accepts the actual answer to an explicit cancellation question, derives IDs from
the live participation/execution, and rechecks authority/version. Only `yes`
cancels; `no`/`unclear` retains the reservation. If another time is still requested,
the objective remains open. Its authorized cancellation advances only the current
call's participation binding, so the specialist can commit a replacement on that
same call. A human edit never advances that binding. Declining further scheduling
closes the objective as refusal; a request without an objective is itself closed,
and its waiting callbacks are withdrawn. Keeping the booking needs the lead's
recorded decline of that version.

An explicitly configured 240-minute reminder policy supports close bookings only
when the next window leaves at least 20 minutes. An unanswered first reminder can
have one more contact attempt at least 60 minutes later, inside the same authorized
window with 20 minutes remaining. Version, lease, dial key, DNC, membership and
billing gates remain. No broad default policy or new organization is enabled.

The existing reminder activity repairs pending action projections before delivering
receipts: reminders, external creation/move and cancellation. Retry review times
prevent failed projections from starving later actions; a repair that keeps
failing is retried twice as far apart each time, from one minute up to thirty, and
stays pending until it succeeds. External cancellation uses
the original owned account/event; accepted DELETE or already-absent results are
safe to replay. The provider calls follow the existing CalendarService owner:
[Google events delete](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete)
and [Microsoft event delete](https://learn.microsoft.com/graph/api/event-delete?view=graph-rest-1.0).
The Ringee cancellation remains authoritative during provider failure.

Receipts cover booking, attendance confirmation, move/replacement, authorized
cancellation, declined without rescheduling and agreed specialist callback.
Scheduling setup accepts administrator-only `receiptRecipients`: existing workspaces
preserve `legacy`; new setup defaults to `contact_responsible`. Separate audience
rows let the member receive the result without the contact's email. A later usable
address sends only the still-valid outstanding receipt. Legacy audience preferences
are preserved, including a contact-only late-address obligation for new actions.
Provider acceptance marks sent; frozen payloads, claim fencing and bounded provider
idempotency protect restarts. External messages use the effective language and
omit internal notes, transcript and technical errors. Email failure never changes
the business result. Cancellation does not wait for email delivery.

### Stage 3 deployment and validation

After Stage 1/2 prerequisites, apply
`migrations-pending/20261105090000_follow_up_resolution/migration.sql`, then run
`pending-migrations/20261105090100_follow_up_resolution_indexes.sql` with psql in
autocommit (concurrent indexes and FK validation). These are tracked in
`packages/database/prisma`; the ignored `migrations` directory and the broken root
migrate alias are not used. No Call-table index or data backfill is introduced.
Regenerate Prisma and deploy database/backend/orchestrator after the schema.
Provider tool drift includes the new endpoint, so configured assistants are
re-synced through the existing dial/handoff owner before use. Keep the pilot
allowlist and existing administrator enrollment consent.

`prepare-follow-up-database.mjs` bootstraps disposable local PostgreSQL using the
actual Stage 1/2/3 SQL, including lifecycle constraints and concurrent indexes.
Stage 3 tests cover exact booking evidence, same-call moves, one replacement under
replay, human edits, competing reservations, current-version attendance, explicit
cancellation, foreign/outgoing participants, atomic history/receipts, projection
repair after restart, preserved edited notes, provider acceptance with lost DB
acknowledgment, late addresses and competing reminder/callback reservations.
The source-controlled business-rule changes are CAL-003, AGENT-006/017/019/020/021/022;
tariffs, ledger keys and public enums remain additive.

Verified on 6 November 2026:

- Full services suite: **1,595 passed**, zero failures or skips, with both
  `DATABASE_URL` and `RINGEE_FOLLOWUP_TEST_DATABASE_URL` set to disposable local
  PostgreSQL. After the final same-call cancellation fix, both PostgreSQL suites
  and the handoff suite were rerun: **108 passed**, including the added replacement
  regression. These are overlapping runs, not additive totals.
- Database suite: **73 passed**, two unrelated opt-in tests skipped. Platform:
  **426 passed**. Providers were mocked throughout.
- Prisma generation and database, backend and orchestrator Nest builds passed;
  all three builds were repeated after the final participation-binding change.
- An `OrchestratorModule` application context resolved the meeting, email,
  reminder, callback, objective, handoff and tool owners against disposable
  PostgreSQL, with inert Redis and external HTTP blocked. No backend bootstrap,
  Temporal worker, reminder loop or dialing loop was started.
- Repository ESLint: **zero errors, 153 existing warnings**. Final changed-file
  ESLint: no warnings. Repository Prettier and diff whitespace checks passed.
- The actual Stage 1/2/3 SQL and concurrent indexes applied successfully to a
  separate empty local PostgreSQL 17 database using the preparation script.
  No production migration, real call or external receipt was sent.

The full services run used the installed package-script tools directly from
`packages/services`, avoiding package-manager dependency refresh during checks:

```bash
TS_NODE_PROJECT=tsconfig.json node --env-file-if-exists=../../.env \
  --require ts-node/register --require tsconfig-paths/register \
  --test --test-concurrency=4 "src/**/*.spec.ts"
```

Set both database environment variables explicitly to the disposable database
before that command. The final focused run used concurrency two and the paths
`src/services/ai-pipeline/follow-up.postgres.spec.ts`,
`src/services/ai-pipeline/human-follow-up.postgres.spec.ts` and
`src/services/voice-agents/automations/voice-agent-handoff.service.spec.ts`.
Builds used each workspace's installed `node_modules/.bin/nest build`; repository
checks used `node_modules/.bin/eslint .`, `node_modules/.bin/prettier --check .`
and `git diff --check` against the task's base revision.

Controlled provider validation remains required: actual assistant switching and
consent speech, effective-language callback audio, real invitation/cancellation
behavior, mailbox receipt/reply-to, uncertain provider acknowledgment and final
voice/AI settlement with explicitly authorized test contacts. Automated mock tests
do not establish those provider facts. Stage 4 provisioning, broader onboarding
and rollout remain out of scope.

## Stage 4A: personal (freelancer) workspaces

Freelancers get the same AI Voice Agents capabilities as organizations, in
their own personal workspace (`userId` + `organizationId: null`, `WRK-001`),
behind an explicit backend pilot. No synthetic organization and no
Organization subscription is involved; billing is unchanged (tokens and
minutes through `VoiceAgentBillingService`/`CreditService`, charged to the
workspace persisted on the agent call). Rules changed deliberately:
AGENT-011, AGENT-018 (rewritten); AGENT-016, AGENT-019, AGENT-020, AGENT-021,
AGENT-022 and WRK-002 (scope wording).

### Access and admission

`voiceAgentAccess` (`services/voice-agents/voice-agent-access.ts`) is the one
decision, read by `VoiceAgentAccessGuard`, every service entry point, the
dashboard's `GET /api/ai-voice-agents-access` (additive `workspaceType`) and the
workers:

| Workspace    | Module (agents, manual calls) | Automated work                                         |
| ------------ | ----------------------------- | ------------------------------------------------------ |
| Organization | always, as before             | `AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS` (`*` = every one) |
| Personal     | only when enrolled            | only when enrolled                                     |

Enrollment is `AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS`: Ringee user ids only. A
wildcard or malformed entry is dropped with a warning and admits nobody; the
organization list's `*` never admits a personal workspace. The guard reads the
personal owner from the auth layer. Provider callbacks keep their own
authorization: a call already started finishes and settles whatever admission
says, and clone reconciliation runs in the clone's persisted workspace.

Personal capabilities: reminders and confirmations, scheduling ("Call to
schedule" books with the owner), human-outcome objectives, reminder→scheduling
handoff, agreed and recovery callbacks, explicit cancellation and moves,
attributed notes and receipts. The AI receptionist is not offered in a personal
workspace yet: an inbound leg the AI answers would occupy its owner's single
call (CALL-001), and transfers to the owner need the per-user browser endpoint
only organizations are issued (TELEPHONY, "AI Receptionist").

### Ownership, persistence and claims

Every organization-only comparison in the voice-agent, reminder, receipt,
handoff, callback and objective owners now uses the canonical helpers
(`buildOwnershipFilter`, `workspaceOwnershipSql`, `isInWorkspace`,
`isSameWorkspace`, `workspaceOf`). Two personal rows share a null organization
without sharing a workspace; a user's personal workspace and their organization
never mix. Deferred work rebuilds its scope from the persisted row. Membership
and administration are `OrganizationRepository.isWorkspaceMember` /
`isWorkspaceAdmin`: a personal workspace's only member and administrator is its
owner, so personal receipts go to the owner and personal exceptions to the
owner (AGENT-010 already did).

Schema (`20261107120000_personal_voice_agent_scope`): `organizationId` becomes
nullable on `AiVoiceAgentAutomation`, `MeetingReminderPolicy`,
`MeetingReminderExecution`, `MeetingEmailDelivery`, `MeetingAutomationAction`,
`AiVoiceAgentHandoff` and `AiVoiceAgentCallParticipant`; each personal row's
owner is its existing `userId`. Participations gain `userId` and the check
`AiVoiceAgentCallParticipant_workspace_check` (organization or owner). No row is
backfilled or reassigned. One rail automation per personal workspace and
capability is the partial unique index
`AiVoiceAgentAutomation_personal_capability_contextKey_key` (PostgreSQL NULLs
are distinct, so the organization key cannot cover it); setup and claims also
serialize on the workspace lock. Objective source keys keep the bare
organization id for organizations and use `personal:<owner>` for personal
workspaces; personal objectives are `PendingAction` rows with context
`personal`.

Claims that filter by admission do it inside the query
(`WorkspaceAdmission`: receipts and their late-address requeue, four-hour
retries, action maintenance), so excluded rows never take a slot. The reminder
and agent-callback claims keep their existing behavior: an excluded row is
claimed and recorded `skipped`/`missed` with `automations_disabled`. The final
dispatch fences (`authorizeDial`, `commitFollowUpDispatch`) and the contact
reservation read only the dispatching workspace: another freelancer's DNC entry
for the same number does not apply, the owner's does.

### Deployment (prepared behind the pilot)

1. After the Stage 3 SQL, apply
   `migrations-pending/20261107120000_personal_voice_agent_scope/migration.sql`
   (transactional, additive; no data rewrite).
2. Run `pending-migrations/20261107120100_personal_voice_agent_scope_indexes.sql`
   by hand with psql and autocommit: the partial unique index `CONCURRENTLY`,
   then `VALIDATE CONSTRAINT`. Confirm both with the script's check queries.
3. Regenerate Prisma and deploy database, backend, orchestrator and frontend.
   Keep `AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS` empty.
4. Before admitting anyone, verify no pre-4A API or worker remains (every ECS
   service on the new task definition, old tasks drained; only new Temporal
   workers polling the task queue). Pre-4A code mishandles personal rows: its
   agent-callback decision cancels a callback without an organization, its
   reminder and handoff reviews skip or park them as `automations_disabled`,
   and with `*` its receipt claim takes personal deliveries and parks them. Old
   code never places a call or sends an email for a personal row, but it would
   withdraw pending personal work — which is why no personal row may exist
   while any old instance runs. Personal rows only appear after step 5.
5. Admit explicitly selected owners by id, and restart the API and workers to
   read the setting. Organization access and allowlist behavior are unchanged.

### Rollback limits

- Emptying the personal list closes new personal work at once: no module
  access, no setup, no new dispatch; due personal reminders and agent callbacks
  are recorded `automations_disabled`, objectives become `blocked`
  (`automations_disabled`) with their history kept, receipts wait. Calls already
  placed finish, record and settle.
- Restoring pre-4A code after personal rows exist withdraws that pending
  personal work (step 4). Close admission first, let in-flight calls settle
  (the AI half can take up to two hours), then roll back.
- The relaxed columns are compatible with pre-4A code for organization rows,
  so the schema can stay. Restoring `NOT NULL` fails while any personal row
  exists and would require deleting personal data; it is not part of a normal
  rollback.

### Validation

Verified on 10 November 2026 (mocked providers; a throwaway PostgreSQL 17
cluster started for this check, prepared by `prepare-follow-up-database.mjs`
from the pre-4A schema plus the real Stage 1/2/3/4A SQL; `prisma migrate diff`
against `schema.prisma` reported an empty migration):

- Full services suite with both database variables pointed at that database:
  **1,634 passed**, zero failures or skips, including the Stage 1 and Stage 2
  PostgreSQL suites (organization regressions) and the new
  `personal-follow-up.postgres.spec.ts` (personal enrollment and its key and
  context; an unenrolled freelancer's identical policy enrolling nothing;
  dispatch in the persisted personal scope while the owner administers an
  organization with its own specialist; a placement from that organization
  refused at the commit fence; another freelancer's DNC not applied and the
  owner's own applied; exact personal reservation resolving with an attributed
  note and receipts to the owner, organization meetings still copying admins;
  owner reads/controls, another freelancer refused; leaving the pilot blocking
  new dispatch while the organization continues). After the final formatting
  pass every touched spec file was rerun: 343 passed.
- Database suite with `DATABASE_URL` and `RINGEE_AUTOMATION_TEST_DATABASE_URL`
  on the same database: **80 passed**, two unrelated opt-in suites skipped. New
  cases: six concurrent personal claims and four concurrent setups converge on
  one row, the partial index refuses a writer outside the lock, organization
  uniqueness unchanged; a personal claim creates its agent while another
  workspace's cannot; receipt claims admit personal and organization work
  while three older rows of an unadmitted freelancer take no slot, also with
  `*`; the send fence, reminder `authorizeDial` and contact reservation stay in
  the owner's workspace; maintenance reads and completes only admitted, owned
  actions; the participation check refuses an ownerless row.
- Unit coverage: access policy (wildcards, two freelancers, the same user's
  personal workspace and organization, explicit-id parsing), automation service
  (owner authority, receptionist refusal, personal "Call to schedule"),
  handoff (own destination, another freelancer's agent refused, off-pilot
  request kept visible), `startInbound` binding, CALL-001/003 with personal AI
  calls, personal settlement once on the persisted balance, reminder worker,
  and `ownership.types` helpers (platform **432 passed**).
- Agent **31 passed** plus typecheck; frontend tests **32 passed**; extension
  and CLI typechecks; `tsc --noEmit` for database, services, backend,
  orchestrator and frontend after formatting.
- `pnpm prisma:generate`, `pnpm build:database`, `pnpm build:backend`,
  `pnpm build:orchestrator` and `pnpm build:frontend` (the tracked
  `public/sw.js.map` it rewrites was restored).
- An `OrchestratorModule` application context from the compiled dist resolved
  the automation, handoff, tool, call, billing, reminder, receipt, meeting,
  callback, objective and agent owners and their repositories, and ran an
  admission-filtered claim, against that database: dummy configuration (no
  `.env`), an inert local Redis stub, Temporal on a closed port and outbound
  HTTP refused. No backend bootstrap, worker, schedule or dial loop started.
- Migration on a copy of the migrated database: reverted while no personal
  row existed, then re-applied over populated organization rows (every
  `organizationId` kept, check validated, index valid); once a personal row
  existed, restoring `NOT NULL` failed as documented.
- `pnpm lint`: zero errors, the existing 153 warnings; changed-file ESLint added
  none. `pnpm format:check` and `git diff --check` passed.

No production database, real call, provider request or email was used.

Pending live validation, in an explicitly enrolled personal workspace with test
contacts: reminder → handoff → move/cancel audio and tools, agreed and recovery
callbacks, receipt delivery and reply-to, and AI/voice settlement against the
personal balance. Stage 4B (PostHog) and 4C (native provisioning, shared
onboarding, 240-minute defaults) are not part of this delivery.
