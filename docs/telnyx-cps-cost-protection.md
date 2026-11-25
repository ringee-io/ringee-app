# Telnyx outbound CPS cost protection

Date: 2026-11-24. Scope: local, uncommitted changes in Ringee and
`../n8n-nodes-ringee`. No production infrastructure, provider settings, customer
prices or paid calls were changed.

**Release recommendation: NO-GO for a claim of account-wide CPS protection.**
Application HTTP dispatch is protected locally; direct browser/SIP/PBX traffic,
cross-environment coordination and provider billing measurements remain release
blockers. This is a useful implementation, not evidence of zero surcharge.

## Provider rules independently checked

The current [Telnyx surcharge notice](https://support.telnyx.com/en/articles/7834487-calls-per-second-cps-surcharge)
confirms the December 1, 2026 extension to Programmable Voice, Voice API, TeXML
and Programmable Fax, alongside SIP Trunking. Billing uses accepted outbound
attempts at account scope, monthly P95 of active hourly peaks; inactive hours,
Telnyx internal retries and CPS-blocked attempts are excluded.

| Concept                | Scope and purpose                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Monthly billable CPS   | Account-level cost measurement, independent of live request limits                                     |
| Real-time SIP CPS      | Source IP / SIP username protection; standard default 20 CPS; excess can receive `503 ... P05`         |
| Programmable Voice DPS | API Dial request throughput; separate from SIP INVITE limits; inspect the actual account's entitlement |
| Concurrent calls       | Simultaneously active legs, independent of how quickly they started                                    |

The [CPS limits article](https://support.telnyx.com/en/articles/15668484-calls-per-second-cps-limits)
also distinguishes logical dials from SIP INVITEs: retries, retransmissions and
forking can create additional signaling. No numeric API DPS entitlement or
production concurrent-call entitlement was inferred from those documents.
The [Dial reference](https://developers.telnyx.com/api-reference/call-commands/dial)
is a command contract, not proof of this account's configured limits.

## Audit of outbound origination

Request flow remains controller → services → repositories, with provider calls
inside platform adapters. HTTP origination converges on `TelnyxClient`; WebRTC
and device SIP signaling do not. Backend replicas, Temporal workers and clients
can therefore be independent originators.

Both processes that originate calls, the API (`AppModule`) and the Temporal
worker (`OrchestratorModule`), reach `DispatchModule` through
`ServicesModule → TelephonyModule → TelnyxModule`; the worker also imports
`TelephonyModule` itself. Neither depends on the other's graph. Each process owns
its dispatch instance (breaker, counters, settings cache) and the shared budget
lives in the coordination Redis, so **every originating process, the worker
included, must be given `PROVIDER_DISPATCH_REDIS_URL`**: under `enforce`, a
process without it defers every outbound call. The classes that dial declare the
service `@Optional()` so a script can build them alone, which would let a
mis-wired root dial unpaced without a startup error. A spec in each app
(`apps/backend/src/app.module.spec.ts`,
`apps/orchestrator/src/orchestrator.module.spec.ts`) resolves the real module
graph in Nest's preview mode and fails when any class that declares the service
is not wired to the one in `DispatchModule`. Both run with the apps' `test`
scripts.

The counts below are **code-level origination units**, not reconciled billable
CDR counts. A successful application response does not establish Telnyx's
accepted-attempt second or the billing treatment of an internal SIP leg.

| Path                                                      | Owner / originator                                                                       | Attempts or legs created by one logical action                                                  | Coverage                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Manual web dialer                                         | Frontend `newCall`, rotation preflight                                                   | One client dial; any client/SIP retries add units                                               | Start-budget preflight only; signaling bypasses HTTP gate                                 |
| Preview campaign                                          | Dialer orchestration → SSE → browser                                                     | One client dial per assignment                                                                  | Shared preflight; same signaling gap                                                      |
| Progressive campaign                                      | API pollers → assignment → browser                                                       | One client dial per claimed lead; each permitted retry is another dial                          | Automated workspace and account preflight; signaling gap                                  |
| Extension, published SDK, call-session links              | SDK/core or browser `newCall` after server gates                                         | One dial after the person acts; creating a link/session alone dials zero                        | Existing canonical services pace preflights; direct signaling remains                     |
| Human-assisted REST/n8n/MCP/CLI                           | Click-to-call/session services, then a human client                                      | Zero at operation creation, then the client's dial                                              | Same human path, not a server API Dial                                                    |
| AI dashboard calls                                        | `VoiceAgentCallService` → voice-agent provider                                           | One `POST /texml/ai_calls/{app}` per placement                                                  | Shared HTTP egress and AI admission cap / holds                                           |
| REST, n8n, MCP and CLI AI calls                           | Shared voice-agent service; queue worker where eligible                                  | One TeXML API origination per dispatched operation                                              | Durable queue, idempotency, egress; no API-key-specific CPS budget                        |
| Scheduled AI callbacks, appointment reminders, follow-ups | Temporal activities → existing callback/reminder/automation owners → voice-agent service | One origination for each deliberately admitted attempt                                          | Existing durable plans / placement guards plus shared egress; no second competing queue   |
| Server voicemail drop                                     | `VoicemailDropService` → `TelephonyService.dial`                                         | One `POST /calls`                                                                               | Shared HTTP egress                                                                        |
| Inbound ring group / forwarding                           | `InboundRingService`, destination handlers                                               | One `/calls` per persisted ring attempt; fanout and fallback can create several                 | Each HTTP leg paced independently; original inbound leg needs no grant                    |
| Desk-phone outbound                                       | Device SIP → parked call → `connectParkedCall`                                           | Device INVITE plus one transfer-created destination leg                                         | Transfer paced; device INVITE outside application dispatch                                |
| BYOC outbound                                             | Browser → Ringee Call Control → UAC → customer PBX                                       | Client entry plus one transfer; PBX may originate/retry further carrier legs                    | Transfer paced, entry observed; external PBX signaling unverified                         |
| BYOC inbound to desk phone                                | Customer PBX → application → desk-phone destination                                      | Inbound entry plus one transfer; fallback can add legs                                          | New HTTP legs paced; original inbound preserved                                           |
| Call transfers                                            | Telnyx adapter transfer methods                                                          | One new destination leg per transfer command                                                    | Central endpoint guard; conservative CPS accounting even for internal destinations        |
| Caller-ID voice verification                              | `CallerIdService` → `/verified_numbers` with method `call`                               | Provider-controlled verification call                                                           | Conservatively paced; CPS billing classification unverified; SMS does not spend voice CPS |
| Generic TeXML REST and fax                                | Central endpoint recognition                                                             | One API origination request each; XML `<Dial>` or provider-side scripts may create further legs | Endpoint guarded; no application executor or live account inventory verified              |
| Asterisk / SIP Trunking                                   | External PBX/SBC, not a Nest service                                                     | Each new INVITE / retry / fork may add attempts                                                 | No verified shared enforcement point in this checkout                                     |

The telephony SDK's remaining usages are number lookup and operations on an
existing recording, not outbound Dial. Current origination POSTs are centrally
recognized, including binary/multipart methods. A future originating endpoint
must extend that single recognizer. There is no application-generated TeXML
`<Dial>` handler identified in this audit; account-hosted TeXML and external
automation cannot be ruled out by a source-code search.

The sibling `ringee-infra/README.md` explicitly says staging shares the production
Telnyx account. The sibling `ringee-voice` is Asterisk source, not verified deployed
dialplan / trunk configuration. Neither production traffic nor provider CDRs
were inspected. Exact billable multiplicity is therefore an open release gate.

## Limiter and account identity

`ProviderDispatchService` uses atomic Redis Lua and Redis `TIME`. Zero-burst
GCRA clocks enforce minimum spacing; fixed second windows and burst-enabled
token buckets were rejected because they admit boundary bursts. All level and
workspace clocks of an account are checked and advanced in the same script.
Keys share an account hash tag and contain no credentials.

An admission permit is a scheduling hint. Immediately before HTTP origination,
a **separate shared egress clock** checks capacity again. Old permits delayed by
database work cannot all send together. Each additional HTTP attempt needs a
fresh egress grant, including repeats under the same provider command reference.
A replay that only returns an existing durable operation sends nothing and takes
no egress grant. There are no automatic HTTP retries on originating requests.

The egress clocks are the account's **one budget of call starts**. A leg a
client dials itself (browser, extension, SDK, session link, campaign
assignment) never passes the Telnyx client, so its pre-flight is admitted as a
_direct start_ (`admit({ directStart: true })`) on those same egress clocks; a
server-sent leg spends them at the Telnyx client. A browser's dial and a
server's dial therefore cannot both use one moment of capacity. The admission
clocks only schedule server work ahead of its egress, and a queued call is
offered only while both are free.

| Initial setting               | Value                                                                 |
| ----------------------------- | --------------------------------------------------------------------- |
| Account ceiling               | 5 CPS                                                                 |
| Safety margin                 | 20%, giving 4 CPS pacing                                              |
| Automated workspace allowance | 2 CPS, independently configurable                                     |
| Live AI calls per workspace   | 25, independently configurable                                        |
| Interactive wait              | Up to 3 seconds, then explicit deferral; no overage bypass            |
| Queue bound                   | 1,000 per workspace; 5,000 total, serialized admission                |
| Queue deadline                | 30 minutes for higher-priority automation; 120 minutes for background |

`TELNYX_ACCOUNT_REF` must be a stable, verified **billing-account** reference.
Rotating a key or changing an integration must not change it. All credentials
for the same account, including staging, must use the same
`PROVIDER_DISPATCH_REDIS_URL`, Redis database, reference and compatible policy.
This connection is deliberately separate from environment-local `REDIS_URL`.
An unset coordination URL fails closed under enforcement.

There is one managed Telnyx credential/account resolver today. Existing BYOC
stores customer SIP/PBX credentials as Telnyx UAC resources on that managed
account; it does not accept independent customer Telnyx API accounts. The
provider-aware resolver / key separation is tested with independent references.
Supporting customer Telnyx accounts requires a verified account resolver and
matching credential selection, not key hashing or a workspace-derived account.
No unrelated carrier is put under Telnyx's five-CPS budget, and no traffic is
rerouted to evade billing.

Limits are cached for two seconds and staff overrides are durable in PostgreSQL.
A cold settings-store failure refuses new dispatch instead of discarding a
stored pause or lower limit; a warm failure retains known settings. Separate
installations must share the authoritative policy or coordinate changes across
all installations. This has **not** been operationally verified. Renaming a
reference, partitioning Redis, or running old unprotected binaries bypasses the
account budget and blocks release.

## Durable queue and financial lifecycle

Queue-enabled integration starts always persist `AiVoiceAgentCall` and
`AiVoiceAgentCallDispatch` together and return promptly. They do not call the
provider inline, even when idle. The queue has hard workspace and global bounds.
The Temporal pump is kicked on enqueue and has a 15-second recovery schedule;
maintenance runs each minute. Workflow passes, activity durations, preparation
retries and operation lifetimes are bounded.

Workers consider one candidate per workspace, rotate among workspaces, and age
waiting automation toward P1 without promoting it to P0. They claim a lease,
re-check workspace membership, user block / calling permission, integration
status, agent readiness, DNC, caller-number availability and AI concurrency, and
prepare the provider application. Existing reminder/callback owners retain their
version and permitted-hours placement fences. Generic API agent calls have no
additional configured calling-hours policy in the current product; this release
does not invent one. Campaigns keep their existing calling-window check.

The final queue commit fences the claim token and unexpired lease, expiry and
the workspace AI cap. Inline AI starts take the same workspace admission lock.
Queue claims, cancellation, expiry and commit use consistent call-before-dispatch
row locking. A call queued for hours counts against live concurrency from its
dispatch time, not its original creation time.

After durable placement identity exists, `CreditService.reserveCredits` reserves
a configurable admission estimate (default USD 0.10). There is no hold while
queued. The hold is split between the existing `call-cost:<callId>` and
`ai-voice-agent-cost:<agentCallId>` settlement keys. Credit-row locking prevents
concurrent admissions from reserving the same funds. Each actual debit and the
hold it replaces commit in one transaction; settlement remains provider-metered.
Known pre-placement failure releases the holds. Ambiguous calls retain bounded
holds for reconciliation (at least 24 hours), never an automatic redial.

This estimate is **not a worst-case call budget**: expensive destinations, AI
tokens, recordings, late billing and unreserved older call paths can exceed it.
Full reservation coverage and a cost-derived duration policy need the broader
financial-protection release gate described in [financial-protection.md](financial-protection.md).
It does not change customer prices or charge customers a CPS fee.

Before HTTP initiation the egress clock is checked, including the operation's
deadline. Only proof that nothing was sent lets a committed operation back into
the queue: a definite egress deferral, or a failure that is not a refusal raised
before the provider request could leave (a database blip while its call row or
hold is written, a DNC or balance read that failed in the last check). A rule's
refusal there ends the call. Provider timeouts, lost replies and 5xx responses
remain in doubt and are not blindly dialed again; the Telnyx client reports a
call-starting request without a readable answer as
`CallOriginationUncertainError`, never as a failed dial. A crash after
commit can leave a starting operation that requires reconciliation; it is counted
and alerted, not silently replaced. Pending operations are inspectable by staff.

## Priority and human latency

P0 covers human dials, active transfers and inbound-created ring legs; P1 covers
reminders / scheduled work; P2 covers automated follow-up and progressive
dispatch; P3 covers high-volume integrations. Defaults cap cumulative lower
levels at 75%, 62.5% and 50% of effective account capacity. Automation also leaves
a small guard interval for interactive contenders. Workspace overrides and source
class mappings are staff controlled. Aging limits priority starvation; expiry
makes overload finite. Saturating P0 can still delay or expire background work;
no scheduler can promise all deadlines when offered load exceeds capacity.

Every class obeys the account ceiling. Interactive timeout and coordination loss
return an honest deferral rather than an unbounded overage. Browser preflight
latency and actual carrier arrival latency are different measurements. Redis
tests measure hot interactive waits under saturated automation; production
manual/preview/progressive latency and SIP arrival timing remain unverified.

## n8n and API contracts

Start Call supports 202 `queued`, 201 `initiating` for queue-disabled / older
servers, and 200 idempotent replay. Queue timestamps and expiry survive replay
and status/result reads. Existing enum spellings stay intact: `created` means
starting, `initiating`/`ringing` mean dialing, `in_progress` means active;
`cancelled` and `expired` are additive terminal states that never dialed.

`POST /api/v1/ai-voice-agents/calls/:id/cancel` only withdraws queued work.
`queuedCalls` advertises support. Reads expire an overdue queued operation.
n8n exposes `queued`, `finished`, deadlines and call ID; capacity errors are
returned promptly. Its generic API rate-limit retry remains bounded. Timeouts
and 5xx writes require retrying the same persistent idempotency key, not a new
execution-derived key. Stable record-based keys are required across re-runs.

Queue saturation creates no operation. An inline CPS denial proven to precede
HTTP keeps its failed audit record but atomically retires that record's key so
the same key can retry. A queued terminal failure, cancellation, expiry or an
ambiguous provider response never retires its key. Database pool / transaction
pressure at enqueue returns 503 with an uncertain-admission explanation; the
same key resolves a committed operation instead of enqueuing it twice. Legacy
REST callers without a key must inspect uncertain outcomes before another start.

Existing triggers describe actual calls. Cancelled, expired and pre-dispatch
failed operations do not fabricate `call.completed`. Workflows must retain the
deadline and use bounded status polling to close those branches. See the node's
`docs/queue-and-capacity.md` and updated production readiness audit. No real n8n
worker/restart or provider-backed workflow has been verified in this task.

## Monitoring, estimates and controls

Redis records actual HTTP egress grants per second and class, API accepted /
rejected / ambiguous outcomes, provider DPS errors and wait buckets. Direct client
legs are separately marked as observed when their callback arrives; they are not
proof of accepted-attempt time. Hourly peaks / counts are retained in Redis for
three days and rolled up monotonically into PostgreSQL. PostgreSQL stores the
monthly history; concurrent rollups cannot overwrite a larger peak.

The estimator excludes inactive hours, reports nearest-rank P95 and an
interpolated sensitivity estimate, and labels local measurements. It cannot
remove rejected attempts from the same second retrospectively, see missing PBX
traffic, recover every outage sample, or establish Telnyx's billing hour boundary
and percentile interpolation. Errors can go in either direction. Provider CDR /
reporting data and invoices must be reconciled before invoice-level accuracy is
claimed. No provider reporting API was invoked against the live account.

The pure graduated calculator uses integer cents, configurable schedules and
the December 1 effective date flag. Forecast examples:

| Monthly P95 CPS | USD surcharge |
| --------------: | ------------: |
|               5 |             0 |
|              10 |            60 |
|              25 |           240 |
|              50 |           640 |
|             100 |         1,440 |
|             163 |         2,448 |
|             200 |         3,040 |
|             250 |         4,240 |
|             500 |        11,740 |

`/api/backoffice/dispatch` reuses the staff allowlist and offers status, monthly
estimate, validated settings, per-workspace automation/concurrency overrides,
pause/resume, masked queue inspection and queued cancellation. Raising or
resetting a ceiling above five requires an explicit confirmation and reason.
The account ceiling and automation allowance are independent of live AI capacity.

Alerts use `[cps-alert]` logs and the existing internal email provider for near /
over-ceiling CPS, estimated budget excess, queue saturation / wait, interactive
waits, provider rate errors, unavailable coordination, unknown call-source scope
and committed operations without provider replies. The external log/alarm and
email delivery configuration has not been changed or production-tested. In tests
the email provider is replaced. An undeclared HTTP originator is still paced and
raises an alert; arbitrary external SIP traffic cannot be automatically detected
as a bypass from these application counters alone.

## Outages and release operations

Enforcement never uses process-local CPS counters. Redis failure defers new
outbound work for every class; automated requests stay durable where eligible.
Existing conversations, inbound answers, bridging existing legs and hangups are
not CPS-gated. New outbound legs created by an inbound call still need capacity.
An initially empty egress clock waits one rolling second, preventing an immediate
state-loss reset burst. Those clocks are kept for a day after their last grant,
so a quiet minute is not mistaken for lost state and a person's first dial after
a pause is not held. Use dedicated Redis persistence and no eviction; failover
and external SIP behavior still require an operational rehearsal.

Deployment, for a separately authorized release:

1. Inventory every live account originator, including staging, PBXs, customer
   trunks, TeXML applications and scripts. Verify account identity / CDR units.
2. Supply shared account coordination and compatible policy to every originator.
   `ringee-infra` copies app variables into the ECS services by scope
   (`config/secret-keys.json`), and `shared` reaches both the API and the worker.
   `PROVIDER_DISPATCH_REDIS_URL` has no default and was not listed there when
   this was written: add it to `shared` for both environments before releasing,
   or `enforce` defers every call from both services. `TELNYX_ACCOUNT_REF` and
   the `TELNYX_CPS_*` settings have defaults (`ringee-managed`, `enforce`, ceiling
   five), which suit production but must match staging's.
   Put SIP/PBX enforcement at the outbound INVITE dispatch point, before requests
   reach Telnyx. Per-IP limits and post-acceptance hangups do not solve billing.
3. Manually apply the prepared additive schema migration and separate status-enum
   script. No workflow or startup task applies migrations. Reservation settlement
   and queue-result reads require the new tables before this binary is released.
4. Stage backend and workers with mocked/sandboxed telephony. Drain old processes
   before enabling queueing. Keep `TELNYX_CPS_MODE=enforce`, initial ceiling five
   and the explicit shared coordination URL. Queueing starts only after schema,
   worker, schedule and client checks pass.
5. Complete real n8n worker/restart and SIP/PBX failover tests without paid calls;
   reconcile provider-level measurements before approving the global claim.

Rollback: pause automation, drain or explicitly cancel queued operations, retain
new readers/workers for starting or ambiguous calls and finish cost reconciliation.
Do not roll back to binaries unaware of queued statuses while queued rows remain.
Preserve ledger, holds, queue and hourly data; additive tables/enums need no
destructive rollback. Disabling the limiter while traffic continues is a new
financial exposure decision, not the default rollback. Never flush pacing keys
or change account references to reset capacity.

## Validation and remaining gates

All provider calls in the local suites are mocked. Local Redis and disposable
PostgreSQL verify shared clocks, concurrent requests, durable claims,
expiry/cancellation, held-credit races and settlement. The manual SQL was applied
to a separate database built from the HEAD schema; Prisma's schema comparison
reported no difference. The integration suites run against that migrated schema.

| Validation                                                                   | Local result                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Platform suite, including real Redis pacing and disposable Redis stop/start  | 713 passed, 51 files                                                   |
| Services suite                                                               | 1,756 passed                                                           |
| Dispatch services with real PostgreSQL and Redis                             | 63 passed                                                              |
| Queue, hourly rollups and credit reservations on migrated PostgreSQL         | 37 passed                                                              |
| Database package suite and migration-file checks                             | 73 + 1 passed; 31 + 1 opt-in skips                                     |
| Public API controller and HTTP contracts                                     | 35 passed                                                              |
| API and worker root module graphs resolve one dispatch module (preview mode) | 8 passed (4 + 4); fails when `TelnyxModule` drops `DispatchModule`     |
| Dialer core, published SDK, agent and browser extension                      | 118 / 10 / 31 / 103 passed                                             |
| n8n lint, types, tests, build and package checks                             | 444 passed; validation clean                                           |
| Services, database and affected consumer typechecks                          | Passed                                                                 |
| Backend, orchestrator and frontend builds                                    | Passed; Next build skips frontend lint/types by existing configuration |
| Repository ESLint                                                            | Zero errors; 146 existing warnings                                     |
| Formatting and whitespace checks                                             | Passed                                                                 |

The stress cases include 100 simultaneous placements and 1,000 simultaneous
integration starts across four service instances sharing Redis and PostgreSQL.
The latter creates durable queued identities with no provider sends or held
credits, and bounded expiry closes every operation. Separate clients exercise
rolling-second edges, priority headroom, multiple account references and egress
fencing. These are local instances with mocked providers, not a deployed fleet
or actual simultaneous SIP signaling. An initial combined validation run under
heavy local contention failed admission assertions; isolated repeats pass, and
explicit database-pressure / uncertain-commit regressions verify safe 503
responses and stable-key recovery. This does not establish production throughput.

CodeRabbit CLI reviews include tracked and new implementation files in both
repositories (`--uncommitted --include-untracked --fresh`). Initial monorepo
passes reported no findings. Verified n8n findings corrected persistent-key
guidance, incidental pnpm files, capacity retry policy, event ID correlation,
queued acceptance wording and older-server compatibility. A further review
corrected the main event workflow's missing queued deadline branch and confirmed
the inline CPS-denial key-retirement defect; regression coverage verifies ten
same-key retries place only one leg. Ambiguous outcomes retain their key.
Independent review also fixed unsafe P0 overage/local fallback, delayed permits,
queue-bound races, lease fencing, lock-order inversion, lost queue deadlines and
non-monotonic concurrent rollups. The fourth n8n pass also corrected the timeout
replay promise. Its expiry-on-read question was verified against the public
controller and transactional repository; a concurrent-read snapshot race found
in that verification was fixed. Twenty simultaneous owner reads now observe
expiry without a worker, and another workspace cannot cause that transition.
The fifth n8n pass confirmed ambiguous explicit-key retry wording and event-only
example templates. All eight direct Start Call templates now retain operation
identity and deadlines, wait once until the latest deadline in their input batch
(bounded to 24 hours plus one second), and read status independently of events.
Expired, cancelled, failed and unresolved outcomes remain visible with an
attention marker. This branch never redials or duplicates CRM writes; operators
connect its output to their own idempotent follow-up. Revised templates are
explicitly marked not yet reimported or tested in a live n8n worker.
Final post-fix CLI outcomes are recorded after completion.

Validation logs remain locally in `/private/tmp/ringee-cps-*.log`. No provider
credentials or paid-call tests are needed to reproduce these local checks.

Blocking evidence still needed for GO: actual global SIP/PBX coverage; one shared
coordination/policy authority for every installation of the billing account;
verified accepted-attempt accounting and provider measurements; broader financial
reservation coverage / maximum-exposure policy; manual schema application;
real n8n and SIP failover/restart rehearsals. These cannot be replaced with a
claim that successful local tests guarantee zero provider surcharge.

## Stable implementation rules

CPS-001: all originating HTTP requests pass the central gate. CPS-002: client and
SIP preflight is not global signaling enforcement. CPS-003: traffic class never
exempts the account ceiling. CPS-004: shared atomic pacing uses distributed time.
CPS-005: the key names the billing account. CPS-006: queue transitions are durable
and fenced. CPS-007: ambiguous attempts are not blindly redialed. CPS-008: pricing
is graduated and internal. CPS-009: forecasts distinguish local and provider
measurements. CPS-010: staff changes are validated and spending is explicit.
CPS-011: failures, bypasses and pressure are observable. CPS-012: release requires
verified coverage rather than an application-only zero-cost claim.
