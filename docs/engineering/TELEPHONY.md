# Telephony

Rules: `CALL-*`, `NUM-*`, `CMP-*`, `SESS-*`, `REC-*`, `MSG-*`, `AGENT-*` in
[BUSINESS_RULES.md](BUSINESS_RULES.md).

## Provider boundary

```
@ringee/services       commands ──► TelephonyService
                       events   ◄── TelephonyEvent
        │
        ▼
packages/platform/src/telephony
  interfaces/telephony.service.ts     ← outbound contract
  interfaces/telephony.event.ts       ← inbound contract
  telephony.service.ts                ← dispatcher (one `telnyx` case today)
  telnyx/telnyx.service.ts            ← the only place the Telnyx SDK is imported
  telnyx/telnyx.event.normalizer.ts   ← where Telnyx's event vocabulary stops
```

`TelephonyService.getServiceProvider()` is where a second carrier plugs in. Keep
new capability behind the interface: add the method to the interface first, then
implement it in the adapter, and return Ringee-shaped values.

`isCallAlive()` returns `boolean | null`; `null` means the provider could not
answer and must never be read as "the call ended" (`CALL-010`).

### Inbound normalization

`TelnyxEventNormalizer.normalize()` translates a carrier webhook into a
`TelephonyEvent` at the controller, before anything domain-shaped sees it.
`CallService.handleTelephonyEvent` switches on `TelephonyEventType`; no Telnyx
type appears in `@ringee/services`.

The translation does real work:

| Telnyx                                | Ringee                        | Why                                                          |
| ------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `call.machine.premium.greeting.ended` | `call.machine.greeting.ended` | Same fact, different detection tier — the domain listed both |
| `streaming.failed`                    | `call.streaming.failed`       | Namespaced under the call it belongs to                      |
| `inbound` / `incoming`                | `inbound`                     | One spelling                                                 |
| anything unhandled                    | `unknown`                     | Logged under its provider name and dropped                   |

Common fields (`from`, `to`, `direction`, `connectionId`, `callSessionId`,
`callLegId`, `clientState`, `startedAt`, `customHeaders`) are lifted out of the
payload. The
provider's own event name survives as `providerEventType` and is what gets
written to `Call.lastEventType` and the event log — that is the string an
operator correlates against the carrier dashboard.

Event **bodies** are still provider-shaped, reached via `event.payload` with a
cast (cost parts, recording URLs, transcription segments). When you need a new
common field, lift it into `TelephonyEvent` rather than adding another cast.

The **browser** side has its own normalization: `state-map.ts` in
`@ringee/dialer-core` maps Telnyx call states to Ringee states.

## Call lifecycle

```
dial pre-flight            ConcurrentCallGuardService.requestDial  (Redis SET NX)
                           credit / canCall / caller-ID / DNC gates
        │
        ▼
browser places WebRTC leg  (or Telnyx dials, for voicemail drops & desk phones)
        │
        ▼
call.initiated  ──► (normalized at the controller first)
                ──► voicemail-drop route?  ──► handled and returned
                ──► inbound?  ──► resolve number owner, create Call, push FCM
                ──► SDK correlation header?  ──► adopt the pending SDK row
                ──► otherwise create/attach the Call row
                ──► ensureNoConcurrentCall   (authoritative backstop)
                ──► ensureCallAffordable
                ──► bindToCall (lease → 4h)
        │
        ▼
call.answered   ──► enforceAnsweredCreditPolicy
                    balance <= 0        → hang up
                    balance <= $2       → cap at 5 minutes
        │
        ▼
recording / transcription events
        │
        ▼
call.hangup     ──► status, duration, outcome automation, lease release
                ──► Temporal: processCallRecordingWorkflow
        │
        ▼
call.cost       ──► settle once: margin applied, credits debited, totalCost set
```

Out-of-order delivery is expected: a hangup that beats `call.initiated` is parked
in Redis and replayed once the row exists (`CALL-009`).

`Call.status` is written **only** by `CallService`. `Call.source` records the dial
surface: `web`, `chrome_extension`, `mobile`, `campaign`, `session`, `sip_device`,
`ai_voice_agent` (plus `sdk` for SDK-created rows); null means legacy web.

## One call at a time (`CALL-001`..`CALL-006`)

The rule binds the **personal workspace only**: it exists to stop a solo account
being shared instead of buying the Organization plan. An organization dial is
allowed outright (after `appliesTo` verifies membership, since the
`call.initiated` backstop reads the organization from a browser header), takes no
lease, and an organization call never occupies the personal slot.

The single most subtle piece of the system. `ConcurrentCallGuardService` uses
three stores because no one of them is sufficient:

| Store                  | Role                                       | Why it alone is not enough                     |
| ---------------------- | ------------------------------------------ | ---------------------------------------------- |
| Redis lease (`SET NX`) | atomic election between simultaneous dials | outlives its call when a `call.hangup` is lost |
| Postgres `Call` rows   | what is really up                          | only knows what webhooks told it               |
| The provider           | referee                                    | a round-trip, so only paid for on a refusal    |

Consequences to preserve:

- A refusal is issued only when the database still shows a live call — except
  inside a 20s dial race window where a fresh unbound lease may refuse on its own.
- Rows older than 15s are confirmed against the provider before refusing, and are
  **closed** when the leg is gone. That write is what makes the rule self-healing
  and stops a ghost call sitting in history as eternally "in progress".
- If the provider is unreachable, a row is believed up to a hard limit
  (15 min ringing / 8 h connected) and then closed anyway. Being permanently
  unable to call is the worse failure.
- Redis failure **fails open** — it is an availability dependency here, not a
  security one, because the `call.initiated` backstop still kills a real second
  leg.
- `StaleCallSweeperService` runs the same confirmation periodically so a user who
  never retries is unblocked without touching the product.

Any new dial surface must call `requestDial` — passing the `organizationId` of
its ownership context — and release with `releasePending` when an approved dial
does not become a call. Only bind a leg with `bindToCall` when the guard
`appliesTo` its workspace.

## Numbers and caller IDs

`NumberPurchased` holds both purchased DIDs and verified external caller IDs,
discriminated by `kind`. Key fields: `allowedOutboundSources` (which surfaces may
present it), `allowedOutboundUserIds` (which members), `inboundMode` +
`inboundSipDeviceId` (where inbound rings), and the messaging capability snapshot.

Verification (`CallerIdService`) charges a flat fee per attempt **sent**
(`BILL-016`) and refuses below balance with HTTP 402.

Caller-ID rotation (`packages/services/src/services/caller-id-rotation/`) is a
per-workspace toggle with two strategies (`local_presence`, `balanced`), daily
caps per number, health scores, and four states — `active`, `cooling`, `flagged`
(carrier spam mark, never auto-cleared), `disabled`. Every campaign dial flows
through `resolveDialCallerId`, which is why caps hold campaign-wide.

Preview and progressive campaigns both use `initiateCall`; emitting a preview
dial directly bypasses the reservation and the rotation refusal. The web,
extension, SDK, magic-link sessions and automatic voicemail drops also respect
the selector's null result. Explicit number choices in the SDK/extension/drop
flows retain their existing semantics.

`destination-region.ts` resolves international calling codes and countries via
libphonenumber. `us-area-codes.ts` adds a dated NANPA snapshot for all 50 states
and DC, including overlays newer than the library metadata. Refresh that
snapshot from [NANPA's NPA database](https://reports.nanpa.com/public/npa_report.csv)
when new codes enter service; exclude territories from the US state map.
Outside NANP the leading national digits are a coarse locality preference,
not a guarantee of the recipient's city. A phone prefix describes its
numbering plan, not the current physical location of a portable/mobile line.

### What the carrier can tell you about a number's price

Three endpoints answer three different questions, and they disagree on purpose:

- `/country_coverage` — the countries and types Telnyx issues numbers in. It is
  coverage, not stock.
- `/available_phone_numbers` — what can be ordered right now, with the real cost
  per number. It is also the only source of capabilities and localities. It
  answers **empty for ranges it serves numbers from minutes later**, so an empty
  answer is confirmed before it is believed (`NumberPricingCatalogService`).
- `/pricing` — Telnyx's published price list, as **CSV whatever `Accept` says**,
  ignoring every filter, and served without authentication: it is list pricing,
  not this account's. It is the only price for a type Telnyx sells without
  holding stock (bought as an advance order) — but it reproduces the inventory
  price in most countries and not in NANPA, where a $1 local number is listed at
  international rates. `NumberPricingCatalogService` therefore publishes it only
  for a country whose sampled types it matches exactly (BILL-021).

The rotation repository's SQL regression test can run against an isolated local
PostgreSQL instance by setting `RINGEE_ROTATION_TEST_PG_SOCKET` to its `/tmp/`
socket directory (port 55439, database `postgres`) when running database tests.
It creates only temporary tables and checks the real Prisma query, ownership,
duplicate delivery semantics and a call spanning UTC midnight. The normal
test suite skips this integration case when the variable is absent.

## Campaigns

`DialerOrchestrationService` polls every 500 ms **in the API process**
(`CMP-010`), one tick at a time (`CMP-012`). Per tick, per active campaign:

1. Calling-window check (`CMP-004`) — outside it, nothing is dialed.
2. Find `ready` agent sessions, skipping any still cooling down after a refused
   dial (`CMP-013`).
3. Progressive mode: skip agents already on a call (`CMP-007`).
4. `SELECT FOR UPDATE SKIP LOCKED` the next eligible lead (`CMP-003`), respecting
   `maxAttempts` (`CMP-006`).
5. Claim the agent, compare-and-set `ready → reserved` (`CMP-012`); a lost claim
   hands the lead back.
6. Preview: create the `CallAttempt`, push `lead.assigned`, wait for Dial.
   Progressive: run the dial gates — enablement, credit, the one-call lease,
   caller ID — then create the attempt, push `lead.assigned`, move the agent
   from `reserved` to `dialing` and push `call.initiate`.

A refused dial follows `CMP-013`. The same tick runs the stalled-dial sweep every
10 s: a session `dialing` an attempt with no provider leg for 90 s is paused.

The browser owns the leg once `call.initiate` arrives. The workspace tracks it by
its own Telnyx call id (chosen before `newCall`, which reports the first state
before it returns) and reads every `telnyx.notification` straight from the
client. A leg that ends before the provider acknowledged it (`trying`) never
reached the server, so the browser reports it with `POST /dialer/abandon`.

Retries, callbacks and reminders are Temporal Schedules, not campaign-loop work.

## Inbound routing

Every inbound call, from every carrier, takes one path:

```
incoming call
      │
      ▼
carrier layer          which number was called, and proof of it
   ExternalCarrierService.identifyInbound   → none | refused | identified
      │                                       (a Ringee DID identifies itself
      │                                        by the number that was dialed)
      ▼
routing resolver       who owns this call
   InboundRouteResolverService.resolve(origin)
      ├─ the number row gives the workspace — never a header or a body
      ├─ InboundRoute, or legacyInboundDestination when there is none
      └─ the destination is loaded and re-verified against that workspace
      │
      ▼
CallService            one Call row, with the decision written on it
      │                inboundRouteId · inboundDestinationType ·
      │                inboundDestinationId · ringGroupId · routedAt
      ▼
router                 ring it
   InboundCallRouterService.routeInboundCall
      ├─ USER            → offer to that user's sessions and devices
      ├─ RING_GROUP      → offer to every available member at once
      ├─ DESK_PHONE      → transfer to the handset (or let the number's own
      │                     assignment ring it)
      ├─ IVR             → not implemented
      ├─ EXTENSION       → resolve the organization membership, then User
      └─ AI_RECEPTIONIST → attach the existing AI Voice Agent to this call
```

**The split is the point.** The carrier layer knows carriers and no
destinations; the resolver knows destinations and no carriers. A new carrier
writes an identification step and nothing else; a new destination writes a
handler and nothing else. Rules: `NUM-004`, `NUM-007`, `NUM-009`, `NUM-010`.

`InboundTransport` is what keeps them apart without pretending the difference
does not exist. It describes the **delivery path**, not the provider:

| Transport       | What it is                                    | Can reach                                                     |
| --------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `ringee_webrtc` | Ringee's shared WebRTC credential connection  | user, ring group, desk phone (by the number's own assignment) |
| `call_control`  | a call parked on the Call Control application | user, ring group, internal extension, desk phone, AI agent    |

A destination the transport cannot reach is refused explicitly — when the route
is written, and again before it rings. Assigning a Ringee number to an AI agent
moves only that number to the Call Control application; BYOC already arrives
there. The original direct routes retain their existing delivery path.

### Ring groups

A `RingGroup` is a named set of members; `simultaneous` is the only strategy.
Ringing one is **not** several calls:

```
caller ──► Call (one row)
             ├─ InboundRingAttempt  Edison   ringing
             ├─ InboundRingAttempt  Pedro    ringing
             └─ InboundRingAttempt  Juan     ringing

Pedro claims  ──► Call.answeredByUserId = Pedro   (one conditional UPDATE)
             ├─ Pedro's attempt  answered
             ├─ Edison's attempt cancelled  +  call.inbound.cancelled
             └─ Juan's attempt   cancelled  +  call.inbound.cancelled
```

- The election is `CallRepository.claimInboundAnswer`: one `updateMany` against
  an unclaimed, live row. Two members answering in the same millisecond on two
  API instances still produce one winner.
- A member claims through `POST /api/inbound-calls/:callControlId/claim`
  **before** answering the media leg. Only a member an attempt exists for may
  claim; everyone else gets 403, and a loser gets 409.
- Members learn they are being rung from `call.inbound.ringing` on the per-user
  realtime channel, and to stop from `call.inbound.cancelled`. The push payload
  a phone receives is unchanged, so a ring group looks to the mobile app exactly
  like a direct call.
- That offer is also what the dashboard presents on. Every browser is offered
  every SIP leg (`DEBT-020`), so a browser's own number list cannot decide
  whose call it is — a group's number belongs to the workspace, not to the
  members being rung. The number check runs only while the realtime channel is
  down, so a dropped courier degrades to the pre-routing behavior instead of
  silencing inbound calls.
- Attempts never create separate Call/history or recording rows. Controlled
  endpoints carry their provider handles and settle actual endpoint cost through
  CreditService using `inbound-leg-cost:<attemptId>`. The original caller's
  telephony and AI usage retain their existing settlement keys.
- On Call Control delivery, the authenticated browser claim verifies that it was
  offered the call; the provider's answer elects the actual endpoint atomically
  with `claimInboundEndpoint`. This includes competing devices of the same user.
  The router bridges the winner and hangs up all other physical legs.
- A member who leaves the workspace stops being a target on the next call,
  without anyone editing the group.

### Configuration

`InboundRouteService` and `RingGroupService` are the write side, behind
`@OrgAdminOnly()`:

```
GET    /api/inbound-routes
GET    /api/inbound-routes/:numberKind/:numberId     ringee | external
PUT    /api/inbound-routes/:numberKind/:numberId
DELETE /api/inbound-routes/:numberKind/:numberId     back to the default
GET    /api/ring-groups              POST /api/ring-groups
GET    /api/ring-groups/:id          PATCH  /api/ring-groups/:id
DELETE /api/ring-groups/:id
POST   /api/ring-groups/:id/members  DELETE /api/ring-groups/:id/members/:userId
```

Deleting a ring group deletes the routes that pointed at it: a route naming a
group that is gone would refuse every call to that number, which is an outage
wearing configuration's clothes.

### AI Receptionist

A receptionist is an existing `AiVoiceAgent` selected by an `InboundRoute`.
`VoiceAgentService.inboundConfig` reuses its voice, language, model, greeting,
company context, instructions, knowledge tools and post-call insights. It adds
inbound help-first instructions and authenticated directory/transfer tools as
per-call overrides; the saved outbound assistant is not replaced.

`VoiceAgentCallService.startInbound` attaches one `AiVoiceAgentCall` to the
existing inbound Call, answers that caller leg, and starts the native assistant
with a stable command id. Questions can be resolved without a transfer.
`VoiceAgentResultService` continues to store the AI transcript and summary on
the existing relationship when the AI conversation finishes. Finishing the AI
conversation does not finish a transferred human call.

`search_directory` reads current organization members, groups and internal user
extensions. The model sees names and logical identifiers only. No matches or
ambiguous matches require clarification. `transfer_to_destination` binds its
identity to the provider-filled call header and the agent's hashed tool secret.
Only entries returned by that call's search are accepted; the destination is
re-resolved immediately before use. No SIP URI or credentials can be supplied.

The transfer stores the requested logical destination on Call and invokes the
same `InboundCallRouterService` on the original Call. `InboundRingService` opens
endpoint attempts on the existing Call Control application and bridges the first
answer. It never creates a second Call. The native assistant is stopped only
once something is ringing — and again, with the same command id, before a
person is bridged — so it never talks over whoever picks up. When nothing can
ring, the transfer is reset and the assistant keeps the caller and says so.
When every endpoint ends unanswered, the transfer is recorded as failed
("Nobody answered the transfer.") and the caller is hung up; there is no
voicemail or return to the assistant in this version.
Original caller, called number, carrier, AI agent, recording and session remain
unchanged. `answeredByUserId` and `answeredByRingAttemptId` record the human winner.
Provider and receiving endpoint sessions both resolve to the original Call.
Signed correlation handles receiving-side webhooks from Browser and Desk Phone
without duplicate history or billing.

The dashboard maintains a separate per-user inbound registration using the
existing credential API. Only a server-issued endpoint with a recent ready
heartbeat is eligible; usernames are stored server-side, passwords are returned
only to the authenticated browser. It is issued only to organizations that have
a route delivered this way (an AI receptionist, or a BYOC number routed to a
User, Ring Group or Extension); every other dashboard keeps just the shared
client and asks again every two minutes. The legacy shared client still serves
unmigrated numbers and existing outbound calls (`DEBT-020` remains open there).
Controlled legs send no mobile push: the app has no leg to answer.

Only an AI route holds a Ringee DID on the Call Control application.
`InboundRouteService` moves it there before the route names the agent, and
moves it back — to the desk phone it is pinned to, or to the shared Ringee
connection — when the route is changed or reset, so direct routes keep the
delivery they had. While the AI route exists, pinning, moving or releasing a
desk phone number changes only that fallback, never the number's connection.

Settings / Call Routing, My Numbers and the AI agent detail reuse one assignment
modal. Multiple numbers can select the same agent. Internal extensions are unique
2–6 digit organization membership attributes, edited in a separate modal.
IVR remains unimplemented.

**Deployment and verification:** apply
`packages/database/prisma/pending-migrations/20260922000100_ai_receptionist.sql`
after the existing inbound routing migrations, then regenerate Prisma and deploy
backend and dashboard together. Its `InboundRingAttempt_legacy_endpointKey`
trigger keeps inserts from instances still on the previous client valid during
the rollout; drop it and its function once none remain. Then run
`20260922000200_ai_receptionist_call_indexes.sql` by hand with `psql` — never
through Prisma — to build the stalled-handoff sweep's partial `Call` index
`CONCURRENTLY`. The Call Control application must be configured
as documented for BYOC. Per-user SIP credentials and handsets must accept internal
account calls. No migration of all legacy Ringee numbers is performed.

Before production rollout, use controlled Ringee and BYOC numbers to verify a
knowledge-only conversation, a transfer to User/Group/Extension, simultaneous
Browser and Desk Phone answers, caller hangup during ringing, repeated provider
events, and the resulting transcript, summary, recording and ledger entries.

## Desk phones (SIP)

Behind `DESK_PHONES_ENABLED`. Outbound desk-phone calls are bridged by Telnyx
with a hard `time_limit_secs` (`DESK_PHONE_MAX_CALL_MINUTES`, default 120) so an
unattended phone cannot run up unbounded spend; the real cost still settles from
the CDR. `SipDeviceService` and `DeskPhoneCallService` are the only services that
inject `TelnyxService` directly.

## External carriers (Bring Your Own Carrier)

An organization can connect its own carrier or PBX. Each SIP extension is a
Telnyx **UAC connection** (`ExternalSipEndpoint.providerConnectionId`): Telnyx
registers _to_ the PBX as that extension. External numbers
(`ExternalPhoneNumber`) belong to an endpoint, and several can share one.
`ExternalCarrierService` owns all of it; provider calls go through
`TelephonyService`. Rules: `NUM-007`, `NUM-008`.

### Connection lifecycle

The customer enters only their carrier's settings. Everything else on the UAC
is Ringee's, set by `TelnyxService` (`telnyx.uac.ts`), and nobody configures
anything in Mission Control.

```
save extension ─► ExternalSipEndpoint row (UUID, encrypted SIP password)
  synchronize
    lookup by reference ringee-byoc-<id>     skipped on the very first save
    syncStatus = pending                     durable before any POST
    POST (no ID) | PATCH (ID)                the complete desired state, below
    GET + compare  (verifyCarrierConnection) → providerFqdn, syncStatus = synced
    registration check                       → registrationStatus; never fails the save
```

| UAC field                                        | Source                                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection_name`                                | `ringee-byoc-<endpoint id>`: the recovery key                                                                                                   |
| `active`, `sip_uri_calling_preference: internal` | fixed                                                                                                                                           |
| `user_name`, `password` (Internal UAC)           | derived per connection with the `carrier_uac` key, from `SDK_SIGNING_SECRET` or, when unset, `APP_ENCRYPTION_SECRET`; never stored, never shown |
| `internal_uac_settings.destination_uri`          | `<signed route key>@<Call Control app subdomain>.sip.telnyx.com`, from the first save                                                           |
| `external_uac_settings.*`                        | the customer's form; an unset auth username, from user or outbound proxy is sent as `null`, never `""`                                          |

- **Rotating the signing secret** (`SDK_SIGNING_SECRET`, or
  `APP_ENCRYPTION_SECRET` when it is the one in use) changes every
  connection's internal credentials and every route key, so inbound calls stop
  verifying until each extension is synchronized again; do that for every
  extension right after rotating. Call keys only live for a pre-dial's two
  minutes: a rotation only fails pre-dials in flight.
- **Telnyx requires the Internal UAC username, password and SIP URI.** A UAC
  created without them is accepted and then rejected by its next update
  (`int_username is required`, `SIP URI is required`). Every connection is
  therefore created complete, before any number exists — the inbound route
  does not wait for a desk phone to be chosen.
- **Every PATCH carries the whole desired state** (PATCH is partial on Telnyx),
  so an edit to the carrier settings cannot drop the internal routing. The
  password cannot be read back, so the internal credentials are re-sent only
  when the connection's `user_name` is not Ringee's — which also repairs a
  connection created before they were managed. A 409 ("a previous update is
  still in progress") is retried after 1, 2 and 4 seconds.
- **`synced` means verified**: the connection read back is active, internal-only,
  named after the endpoint, holds Ringee's `user_name` and routes to the
  endpoint's route key. It says nothing about the PBX.
- **Retry converges.** An endpoint with an ID is PATCHed. One without is looked
  up by reference before anything is created, so a connection Telnyx kept after
  an error or a timeout is adopted, not duplicated. A lookup miss creates only
  when the last create was refused outright (`error`), or when an uncertain one
  is older than `UNRESOLVED_CREATE_SETTLE_MS` (2 min); before that the retry is
  refused rather than risk a second UAC. Deleting follows the same rule.
- **Routing a number to a desk phone** verifies the connection and
  re-synchronizes it only when it is not complete (one synchronized before
  inbound was part of every connection, or changed in Mission Control).
- **Registration is separate from synchronization.** `syncStatus` is Ringee's
  configuration of the provider; `registrationStatus` is Telnyx's registration
  with the PBX, which happens on its own time. It is read from
  `GET /v2/sip_registration_status?credential_type=uac_external_credential&connection_id=<id>`
  — the source Mission Control shows: `sip_registration_status` (`registered`,
  `trying`, `failed`, `unregistering`, `connection_disabled`, `unknown`),
  `registered`, and `last_registration_response`. `registered` is believed only
  when the status and the flag agree; the PBX's last answer is kept in
  `providerStatus` (`failed (401 Unauthorized)`). **Do not use** the documented
  `POST /uac_connections/{id}/actions/check_registration_status` (410 Gone for
  every connection, even a deleted one) or the connection's own
  `registration_status` (stays `Not Registered`, `registration_status_updated_at`
  null, while the connection is registered). Reading either made every dial
  pre-flight fail — first as "carrier unavailable" (502), then as "not
  registered" (409).
- **Diagnostics.** A failed `/uac_connections` request logs method, path,
  status and each Telnyx error's code, title, detail and `source.pointer`. Every
  value sent under a password-like key is redacted from that text, and text
  that still contains a fragment of one is withheld. `ExternalCarrierService`
  logs which step failed (`create`, `update`, `verification`,
  `registration check`) with the provider status. A misconfigured Call Control
  application is logged with the check it failed.
- The SIP username must match Telnyx's `external_uac_settings.username` format
  (4–256 letters, digits, `-` or `_`, starting with a letter or digit); it is
  validated before anything is saved.

### Outbound: the web dialer through the customer's carrier

The browser never addresses the carrier. It calls Ringee's own Call Control
application; the server sends that call on to the carrier connection.

```
dialer, external number selected
  POST /caller-id-rotation/resolve { source: "external_carrier", fallbackNumberId }
    ConcurrentCallGuardService.requestDial          (an organization call: allowed)
    CallService.prepareExternalOutbound
      ExternalCarrierService.resolveOutbound        org member · number active · endpoint synced
        ├─ checkCarrierRegistration                 must be `registered`
        └─ getCarrierDialDestination                UAC active + internal, FQDN refreshed
      Call row: pending · outbound · from = external number · to = destination
                externalCarrierId + externalSipEndpointId
      ExternalCarrierService.outboundEntry          sip:<call key>@<app subdomain>.sip.telnyx.com
    ← { destinationUri, callToken }                 no carrier, no number, no credentials
browser: placeCall({ carrierRoute })   same TelnyxRTC client; no caller ID or identity
                                       headers; X-Ringee-Byoc-Call-Id: <signed token>
   │
   ▼  Telnyx reports the browser's call only as leg B, on the Call Control app
leg B  call.initiated (incoming, to = <call key>@<app subdomain>, token header) ──►
       bridgeExternalOutbound: key → row · token names the same row · pending, ≤ 2 min ·
       destination from Ringee's records only: sip:<to>@<providerFqdn> ·
       credit + one-call backstops · atomic claim: B is the call (ordinary lifecycle,
       billed once) · one carrier leg per pre-dial (Redis claim) ·
       transfer B → leg C  (C marked `carrier_outbound_bridge`, early media on)
leg C  Call Control → UAC FQDN ──► customer's PBX ──► their carrier ──► destination
```

- **Why not dial the UAC from the browser.** Verified on a live call
  (2026-09-23): Telnyx sends a WebRTC leg addressed `sip:<E.164>@<UAC fqdn>` to
  the PSTN, not to the connection (`flow_destination: non_telnyx_pstn_number`),
  and rejects it for its missing caller number (`D35`, SIP 403). Its
  `call.initiated` reports `to` as the bare number, so the host it was dialed to
  cannot be checked either. The same address dialed **from Call Control**
  reaches the PBX: a `POST /calls` to it rang the destination through the
  customer's carrier, presenting the customer's number.
- **The call key** (`signCarrierCallKey`) is `rco` + call id + MAC, letters and
  digits, never a number. It names one pre-dial and nothing about the carrier;
  it is MAC'd under its own label, so it never passes as an inbound route key.
- **The server chooses the destination.** Leg C goes to the row's own number on
  its own endpoint's stored FQDN, re-read from the database at transfer time.
- **Number format follows the carrier.** An external number is saved as the
  admin writes it — international, with or without the `+` — because some
  carriers refuse one form. The `+` is the only thing kept: leg C's transfer
  `from` is the external number as saved, and the destination in its SIP URI
  is written the same way (`inCarrierFormat`) — a number saved without `+`
  never gains one on its way to the carrier. Everything else in Ringee stays
  E.164: the `Call` row, the numbers the dialer lists, and inbound `toNumber`. One number may exist once per organization under either spelling
  (checked on save; the unique index only sees one).
  One transfer per pre-dial: a second leg dialed with the same key is hung up,
  and a redelivered webhook changes nothing.
- **Leg B is the call.** Verified on a live call (2026-09-23): the browser's
  call to the application's subdomain has no Call Control leg of its own on
  the WebRTC connection — Telnyx reports it only as the application's incoming
  leg, which carries the browser's `X-Ringee-Byoc-Call-Id`. So B is bound to
  the row (`claimExternalOutbound`, the same gates as `adoptExternalOutbound`)
  and its webhooks run the ordinary lifecycle: answered, hangup, and the one
  debit (`call-cost:<call id>`; Telnyx prices it as `telnyx_subdomain_cc_app`).
  Only leg C carries `carrier_outbound_bridge` client state; its webhooks,
  `call.cost` included, are recognized and never billed or recorded. Should
  Telnyx ever report the browser's side as a leg of its own and it is bound
  first, B only relays it — same `call_session_id` required — and is marked
  too.
- **Failures.** A carrier leg that ends unanswered (busy, declined,
  unreachable) leaves B parked on the application: the server hangs it up and
  stores the cause on the row. After an answer both legs end together. A
  transfer that cannot start hangs B up with the reason on the row. A refused
  B is hung up with the `entry` mark, so its later webhooks are recognized.
  Pre-flight errors reach the user as fixed copy (`use.call.ts`); SIP codes on
  hangup through `carrierCallFailure` (`@ringee/dialer-core`).
- UACs keep `sip_uri_calling_preference: internal` and the application keeps
  `only_my_connections`: only connections on Ringee's account can reach either.
  A leg dialed straight to a carrier host, or carrying a call key without its
  token, is hung up.
- The PBX presents the caller ID configured for the extension; a carrier leg
  carries no Ringee identity headers.
- **Verified on the first live call (2026-09-23):** B reaches the application
  (`flow_destination: telnyx_subdomain_cc_app`) with the key in `to` and the
  token header; C reaches the PBX (`non_telnyx_sip_uri`); B and C share one
  `call_session_id`; audio, ringback and the far end's answer reach the
  browser.

### Inbound: the customer's PBX to a desk phone

```
caller → carrier → PBX → extension registered by the UAC
  → UAC Internal SIP URI  <signed route key>@<Call Control app subdomain>.sip.telnyx.com
  → Call Control application → call.initiated (inbound)
      ExternalCarrierService.identifyInbound        the carrier half, and it stops here
        key verifies → endpoint synced and active → called number:
          the extension's only number, or the one the PBX named in X-Ringee-Called-Number
          then require that number to be active
        → identified { organization, external number, carrier, endpoint } | refused | none
      InboundRouteResolverService                   who owns the call (as for any number)
      InboundCallRouterService → the destination's handler
        DESK_PHONE (DeskPhoneDestinationHandler):
          transfer → sip:<desk phone SIP username>@sip.telnyx.com
          command_id per call · new leg marked with the call's signed id
  desk phone leg:  answered            → the call is answered once, answer automation once
                   hangup, caller up   → the caller's leg ends; the PBX decides what follows
  phone's own connection webhook: the marked leg is not recorded a second time
```

- Explicit routes can target a User, Ring Group, internal Extension or AI agent
  through the common controlled transport. The default without an explicit
  route remains the pinned desk phone, if any.
- The Internal SIP URI uses the SIP subdomain the Call Control application is
  configured with, read from the API on every synchronization. Configuration
  fails closed — no UAC is created or updated — unless that application accepts
  calls only from this account's connections and delivers its webhooks to
  `/api/call/webhook` on the configured `BACKEND_URL` origin.
- `providerFqdn` (`<x>.uac.telnyx.com`) and the Internal SIP URI are different
  things. The FQDN is how Ringee's legs reach the PBX _through_ the UAC
  (outbound); the Internal SIP URI is where Telnyx delivers what the PBX sends
  _to_ the UAC (inbound).
- The route key is `rcr` + endpoint id + a truncated HMAC — letters and digits,
  which every Telnyx SIP URI field accepts. Every connection on the account can
  call the application's subdomain, so the key, not the address, proves which
  PBX a call came from.
- Choosing a desk phone for a number opens that phone's SIP URI to this
  account's connections (`sip_uri_calling_preference: internal`): the transfer
  reaches it that way.
- Ambiguity is refused, never guessed. A refused carrier call is hung up and
  logged, and leaves no history row.
- Ringee numbers keep their inbound path untouched: `identifyInbound` returns
  `none` for anything that is not a route-key call on the Call Control
  application, and the number is resolved as it always was.
- A desk phone rings for up to 120 s, longer than a PBX usually rings an
  extension, so the PBX's own timeout and voicemail still apply.

**PBX requirements.** Route each external number to the extension the UAC
registers. When several numbers share an extension, add
`X-Ringee-Called-Number: <dialed number>` (international, `+` optional) to the
INVITE sent to that extension; without it those calls are refused.

**UAC SIP subdomain (verified 2026-09-23).** Telnyx documents Telnyx → PBX
traffic as using the UAC's own `inbound.sip_subdomain`, but that subdomain
receives calls `from_anyone`, and a PATCH of
`inbound.sip_subdomain_receive_settings` (or the top-level field) is answered
200 and ignored. Ringee never dials it; outbound uses the UAC FQDN from Call
Control (above).

**Not yet verified against a live call:** whether a PBX's `X-` header survives
the UAC into `call.initiated.custom_headers`. Enforced fail-closed; refusals
log the routing reason without exposing credentials. The route key proves which
UAC a call came through, not that the PBX sent it, because the UAC's SIP
subdomain accepts calls from anyone (above).

### Deployment checks

1. Apply the base BYOC migration and then
   `20260917010000_external_carrier_outbound_calls`,
   `20260917020000_external_number_desk_phone_routing` and
   `20260920000000_inbound_routing` from
   `packages/database/prisma/migrations-pending`, using the deployment's existing
   migration process. Regenerate the Prisma client before building the backend.
   The routing migration is additive: every existing number has no `InboundRoute`
   and therefore keeps the behavior it has today (`NUM-009`).
   Then run `packages/database/prisma/pending-migrations/20260920000100_inbound_routing_call_indexes.sql`
   by hand with `psql`, statement by statement — never through Prisma. It builds
   the three `Call` indexes `CONCURRENTLY` and adds their foreign keys `NOT VALID`
   before validating them, so `Call` stays writable during live calls.
2. Verify `DESK_PHONES_ENABLED`, `TELNYX_CALL_CONTROL_APP_ID`, `BACKEND_URL`,
   webhook signature verification and the shared signing secret across backend
   replicas. The Call Control application must be active, have a SIP subdomain,
   receive only this account's connections and use this environment's webhook.
   **No extension can be created or synchronized until it does** — every UAC now
   carries its Internal SIP URI from the first save; the failed check is logged.
3. Synchronize each existing extension (Edit → Save, or Retry connection). That
   gives connections created before this lifecycle their Internal UAC
   credentials and SIP URI, clears optional fields that were sent as `""`, saves
   the generated host and verifies the result before marking the extension
   synchronized. Endpoints left in `error` with a provider ID converge the same
   way; nothing is recreated. Confirm registration and assign the external
   number to an enabled desk phone whose owner still belongs to the
   organization.
4. For multi-number extensions, configure `X-Ringee-Called-Number` even when only
   one assigned number is active. An unidentified call must not be delivered to
   another DID when a number is disabled.
5. Validate an outbound call and an inbound call with a controlled PBX/handset:
   audio, DTMF, caller identity, busy/no answer, hangup from either end, a single
   history row and a single ledger debit. Verify the two provider payload details
   above before enabling the route broadly. Automated tests do not establish
   SIP/media interoperability.

The existing stale-call sweep closes external pre-dials after their two-minute
authorization expires if the browser disappeared without abandoning them. The
expiry write competes atomically with adoption and cannot close an already
bound leg. A cost webhook that beats adoption receives a retryable response,
so it is settled after the call exists, using the existing ledger idempotency key.

## AI voice agent calls

A different shape of call: the provider runs the conversation, and nobody is on
Ringee's end of it. Starting one requires an active organization workspace
(AGENT-011), regardless of whether REST, the CLI or MCP triggered it.

```
POST /api/ai-voice-agents/:id/calls   (or the API / CLI / MCP — one path)
        │  VoiceAgentCallService.startCall
        │  canCall · DNC · balance · caller ID · variable validation
        ▼
provider places the call  ──►  Call row (source = "ai_voice_agent") + AiVoiceAgentCall
        │
        ├─ call status callback   ──► token-authenticated route, binds the leg
        │                             and settles the Call row on completion
        ├─ analysis callback       ──► token-authenticated route: summary /
        │                             outcome / sentiment / extracted data
        └─ call.conversation.ended ──► the ordinary signed webhook, normalized
        │
        ▼
ringee.voice-agent-sweep  ──► BOTH halves of the cost (BILL-020), and the
                              recording and transcript (REC-005), read from
                              the provider's own records
```

Consequences worth keeping:

- The agent's call **occupies nobody** (CALL-003). It is server-originated, and
  counting it would lock its owner out of their own dialer.
- The tools the agent calls mid-conversation come back into Ringee on `@Public()`
  routes that carry the agent's shared secret and take the call's identity from
  a provider-filled header, never from the model (AGENT-003).
- The booking tool uses `CalendarService.getBookableSlots`, which fails rather
  than inventing availability (AGENT-002). Which calendar it reads is resolved
  server-side from the agent row and pinned to the call, so the model cannot
  name one and editing the agent mid-call cannot move the booking (CAL-001).
- **An agent call is never priced by a webhook.** `call.cost` and
  `call.recording.saved` are events of the _calling application_ an agent's
  calls go out through, not callbacks of the call, so the per-call
  `StatusCallback` never sees them. Nor can they be routed to
  `/api/call/webhook`: a TeXML application only has `status_callback`, which
  delivers `application/x-www-form-urlencoded` TeXML callbacks (`CallSid`,
  `CallStatus`, …) — not the Call Control JSON envelope that route verifies and
  normalizes. Every agent call priced this way is priced at nothing.
- **`VoiceAgentBillingService` reconciles instead.** It reads the provider's own
  usage records, keyed by the control id Ringee writes down when it places the
  call, so settlement is replayable and depends on no delivery. One agent call
  is billed as three provider record types, each tagged with only the handle
  its own subsystem knows about — get the handle wrong and the answer is a
  confident, empty "free":

  | Record type          | Handle it carries      | What it is                       |
  | -------------------- | ---------------------- | -------------------------------- |
  | `sip-trunking`       | `call_control_id`      | the voice leg → `Call.totalCost` |
  | `ai-voice-assistant` | both                   | the conversation engine          |
  | `inference`          | `conversation_id` only | the model tokens                 |

  The voice leg shares the cost webhook's ledger key (`call-cost:<call id>`) and
  its `totalCost` marker, so whichever path arrives first prices the leg and the
  other cannot charge for it twice. The AI half keeps its own claim
  (`costSettledAt`) and margin (`AI_VOICE_AGENT_PROFIT_MARGIN`).

- **Either provider handle is enough to settle a call.** `providerConversationId`
  is only ever written by the conversation webhook. `listUnsettled` once required
  it, which hid every call whose webhook never arrived — permanently, and
  silently, because those are exactly the calls nothing else would price. The
  sweep now backfills the conversation id from the records themselves.
- **The call's own timeline is reconciled too, not waited for.** Nobody is on
  Ringee's end of an agent leg, so the status callback is the only thing that
  would ever move `Call.status` — and an agent call that never gets one sits at
  `pending` for the rest of its life with no duration, no answer time and no
  outcome, while the stale-call sweep passes over it (it only reaches calls that
  got as far as `ringing`). The `sip-trunking` record that prices the leg also
  dates it: `started_at`, `finished_at`, and `call_sec` — time **connected**,
  which is zero on a leg that was refused and is what tells a real conversation
  apart from an attempt that still billed a minute. So the pass that settles the
  money closes the row, and a call whose money is already settled is swept for
  that reason alone (`listUnsettled`, bounded by a stalled-call window).
  `Call.answeredAt` has to be written there as well: absent, `completeCall`
  auto-dispositions the call as `no_answer` — on a call that just held a full
  conversation.
- **An agent leg's recording is found by `call_control_id`.** The session id is
  reported only on an event Ringee may never receive, so a recordings lookup
  keyed on it answers "none" for calls that were recorded perfectly well. The
  control id is written down the moment the leg is placed. The session handle is
  worth keeping when it does surface — on the recording, on a callback, or in a
  conversation's metadata — but nothing may depend on having it.
- **A conversation id resolves back to its call.** Post-call analysis names the
  conversation and nothing else, and `providerConversationId` is written by the
  conversation webhook — the one delivery that may never arrive. On a miss the
  conversation is read from the provider (`GET /ai/conversations/{id}`), whose
  `metadata` carries `call_control_id`, `call_session_id` and `call_leg_id`.
  Without that second look an analysis arriving before the sweep bound the
  conversation is dropped, and it is delivered once or lost (AGENT-009).
- The outbound voice profile (`TELNYX_OUTBOUND_VOICE_PROFILE_ID`) is still
  Ringee's to pin on the calling application, on every save and before every
  dial — that one the provider does honour.
- The provider's `call_sid` for a TeXML call **is** the call control id, so the
  `Call` row is bound the moment it is created. An event that lands before the
  first status callback is looked up by control id and would otherwise be
  dropped.
- **Post-call analysis is delivered or it is lost** (AGENT-009). The provider
  runs it minutes after the conversation ends and exposes no endpoint to read a
  finished conversation's results back, so the analysis group carries Ringee's
  own callback URL — set at creation and re-sent on every save, which is what
  recovers agents whose group was created before there was a callback. The
  results name the conversation and nothing else: no call handle, which is why
  they cannot ride `/api/call/webhook`, whose normalizer drops any event with no
  `call_control_id`.
- **The agent's clock is call-time context, not saved configuration**
  (AGENT-013). Its prompt references `current_datetime` and `agent_timezone`;
  every dial refreshes both from the agent's selected IANA time zone, so public
  API and dashboard calls interpret “today” and “tomorrow” identically.
- Agent calls publish the same applicable Custom Integration events as other
  calls. The status callback emits the terminal event, post-call analysis emits
  `call.outcome.updated`, a successful booking emits `meeting.created`, and the
  artifact sweep emits `recording.ready` after the recovered recording is
  durably stored. Each path uses the outbound outbox's replay-safe dedupe key.

### Voice delivery and turn-taking

`telnyx.voice-agent.mapper.ts` owns these provider settings for both assistant
creation and updates. Ultra voices (`Telnyx.Ultra.*`) enable `expressive_mode`;
other tiers and an unset voice keep their existing behavior. Telnyx documents
Ultra's expressive delivery in its [voice assistant guide](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant).

Flux receives an explicit starting profile: `eager_eot_threshold: 0.3`,
`eot_threshold: 0.7`, `eot_timeout_ms: 3000`. Eager processing prepares a reply
before the final turn decision and can increase inference usage. The timeout
limits silence when turn confidence is insufficient; it is not a mandatory
three-second response delay. Language selection is preserved, and the Nova-3
fallback receives none of Flux's turn-taking parameters.

The [current transcription guide](https://developers.telnyx.com/docs/inference/ai-assistants/transcription-settings)
lists Portal defaults of `0.4 / 0.8 / 5000`; Ringee's more responsive profile is
a tuning choice, not a claim about provider defaults. That guide describes
`smart_format` and `numerals` for non-Flux Deepgram models, while an older
`/transcription-settings/index` page groups them with all Deepgram models.
Ringee omits those formatting flags on Flux pending verified adapter support.
According to the [interruption guide](https://developers.telnyx.com/docs/inference/ai-assistants/interruption-settings),
interruptions are enabled by default and Flux owns turn detection; do not apply
Nova-style speaking-plan thresholds to tune Flux.

Deploying the mapper does not update stored provider assistants. Existing agents
receive the profile on save or through `VoiceAgentService.resync`; starting a
browser test alone only changes test access and variables. Reverting code also
requires a resync: explicitly restore the prior `voice_settings` and
`transcription.settings` values, since omitting an optional field on a provider
update is not proof that it was reset.

Before expanding a rollout, compare the same voice, model, prompt and test script
on browser and telephone calls. Measure end-of-speech to first audible response
(median and p95), unwanted cutoffs, interruption recovery, booking accuracy and
inference cost per completed call. Include Spanish accents, pauses while
dictating a new email or number, mid-sentence corrections, background noise and
tool delays. Mapper tests verify the API contract; they do not establish voice
quality or account-level support for eager processing.

## Recordings and transcription

A finished recording is downloaded, stored as a public mp3 **and** an encrypted
private copy keyed to the workspace (`REC-002`), linked to the `Call`, then fed
to CRM sync and optional auto-transcription — all inside a retryable Temporal
activity that guards its own duplication (`REC-003`).

**Who decides to record.** Every other call surface asks the workspace: the
`recordAllCalls` preference resolved by `CallRecordingSettingsService`
(organization settings win in an organization, personal settings otherwise).
**An AI voice agent call is always recorded**, unconditionally — the agent dial
path sets `record` on the call itself and never consults that preference, so
turning workspace recording off does not turn agents off. Getting the audio
back is a separate problem: the provider announces a saved recording as an
event of the calling application, which is not a delivery Ringee can rely on,
so `VoiceAgentBillingService` reads the recording from the provider's own
records in the same sweep that prices the call. It is skipped when the call
already has one, and a failure there never holds up the money.

Transcription runs live over the Telnyx media stream (Deepgram) or after the fact
over the recording URL. Billing prefers the provider's reported cost and falls
back to per-minute duration, recorded once on the header (`REC-004`).

**An agent call takes neither path.** There is no media stream to Ringee, and
paying Deepgram to transcribe the recording would buy text the account already
owns: the provider transcribed the conversation in order to hold it. So the
sweep reads it — `GET /ai/conversations/{id}/messages` — and stores it through
`TranscriptionService.saveProviderTranscript` (`REC-005`), in the `realtime`
slot, mapped onto the same `outbound`/`inbound` tracks a live Deepgram
transcript uses so every consumer that already renders one renders this. The
header records `provider: "telnyx"` and carries `chargedOnHangup` pre-set, so
the realtime debit cannot charge Deepgram rates for words Deepgram never heard.

Both artifacts are published on their own schedule, not the usage records', so
they get a pass of their own: `listMissingArtifacts` finds completed calls whose
recording or transcript is still missing and retries them for a bounded window.
Without it, a settled call — one that left the billing list on the first sweep —
kept whatever it had at that moment and nothing ever went back for the rest.

The existing stale-call sweep also bounds interrupted AI handoffs: transfers still
preparing or ringing after six minutes — longer than the longest ring a group can
be given (300 seconds) — are marked failed and their provider legs are terminated
on the next sweep. A failure there never holds up the rest of the sweep. Normal ring timeouts remain with the provider;
`CallService` remains the owner of final call lifecycle updates. Commands use
stable IDs, and failed termination is retried by the same sweep.
