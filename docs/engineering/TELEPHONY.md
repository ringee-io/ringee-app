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

Common fields (`from`, `to`, `direction`, `callSessionId`, `callLegId`,
`clientState`, `startedAt`, `customHeaders`) are lifted out of the payload. The
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

Any new dial surface must call `requestDial`, and release with `releasePending`
when an approved dial does not become a call.

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

## Campaigns

`DialerOrchestrationService` polls every 500 ms **in the API process**
(`CMP-010`). Per tick, per active campaign:

1. Calling-window check (`CMP-004`) — outside it, nothing is dialed.
2. Find `ready` agent sessions.
3. Progressive mode: skip agents already on a call (`CMP-007`).
4. `SELECT FOR UPDATE SKIP LOCKED` the next eligible lead (`CMP-003`), respecting
   `maxAttempts` (`CMP-006`).
5. Reserve the agent, create the `CallAttempt`, push `lead.assigned` over SSE.
6. Progressive: dial immediately. Preview: wait for the agent to press Dial.

Retries, callbacks and reminders are Temporal Schedules, not campaign-loop work.

## Desk phones (SIP)

Behind `DESK_PHONES_ENABLED`. Outbound desk-phone calls are bridged by Telnyx
with a hard `time_limit_secs` (`DESK_PHONE_MAX_CALL_MINUTES`, default 120) so an
unattended phone cannot run up unbounded spend; the real cost still settles from
the CDR. `SipDeviceService` and `DeskPhoneCallService` are the only services that
inject `TelnyxService` directly.

## AI voice agent calls

A different shape of call: the provider runs the conversation, and nobody is on
Ringee's end of it.

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
  than inventing availability (AGENT-002).
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
