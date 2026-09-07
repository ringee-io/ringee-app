# Billing and credits

Rules: `BILL-001`..`BILL-019` in [BUSINESS_RULES.md](BUSINESS_RULES.md).

Ringee is prepaid. Customers buy **credits** (USD) through Stripe and consume them
per call minute, per message, per transcription minute, per AI token and per
caller-ID verification. There are no per-seat plans gating usage — the balance is
the gate.

## How money is represented

| Concept   | Storage                                                   | Notes                                                                                                                                  |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Balance   | `Credit.amount` — `Float`, USD                            | One row per workspace (user **or** organization)                                                                                       |
| Purchase  | `CreditTopup` — `amount` + `amountCents`                  | Stripe ids, `source`                                                                                                                   |
| Grant     | `CreditGrant` — `amount`                                  | Non-purchase: offers, promos, goodwill                                                                                                 |
| Debit     | `CreditDebit` — `amount`, `balanceBefore`, `balanceAfter` | Every consumption                                                                                                                      |
| Call cost | `Call.totalCost` + `Call.costMeta`                        | `costMeta` keeps the full breakdown                                                                                                    |
| Margin    | env multipliers                                           | `CALL_PROFIT_MARGIN`, `CALL_RECORDING_PROFIT_MARGIN`, `MESSAGE_PROFIT_MARGIN`, `TRANSCRIPTION_CREDIT_PROFIT_MARGIN`, `AI_TOKEN_MARGIN` |

**There is a ledger.** `CreditDebit`, `CreditGrant` and `CreditTopup` are it. It
is append-only and each row carries a unique idempotency key. `Credit.amount` is
a running balance kept in step with the ledger inside the same transaction — not
derived from it on read. Do not design as if there were no ledger, and do not
replace the running balance with a fold over the ledger as a side effect of
another change.

## The three doors

```
                      ┌────────────────────────────────────────┐
Stripe webhook ──────►│ creditTopupOnce(ctx, amount, ref)      │──► CreditTopup
(confirmed payment)   │   topupOnce → false = already done     │    + balance ↑
                      └────────────────────────────────────────┘

offers / promos ─────►┌────────────────────────────────────────┐
                      │ grantCreditsOnce(ctx, amount, ref)     │──► CreditGrant
                      │   returns { balance, granted }         │    + balance ↑
                      └────────────────────────────────────────┘

usage ───────────────►┌────────────────────────────────────────┐
                      │ consumeCredits(ctx, amount, ref)       │──► CreditDebit
                      │   returns Credit; debited=false on dup │    + balance ↓
                      └────────────────────────────────────────┘
```

Every one of these is a single Prisma transaction: unique key insert + balance
increment. A duplicate key is caught and reported, never thrown at the caller as
a failure. Side effects are gated on the returned boolean (`BILL-004`).

### Idempotency key conventions

| Source                       | Key                                                                |
| ---------------------------- | ------------------------------------------------------------------ |
| Call settlement              | `call-cost:<callId>` (source `telnyx.call.cost`)                   |
| Desk-phone call              | `call-cost:<callId>` (source `telnyx.desk-phone.call.cost`)        |
| Message                      | `message-cost:<messageId>`                                         |
| Live transcription           | `transcription-realtime:<headerId>`                                |
| Recording transcription      | `transcription-recording:<headerId>`                               |
| Human voice clone            | `voice-clone:<localCloneId>` (source `ai-voice-agent.voice-clone`) |
| Offer reward                 | `OfferRewardService.idempotencyKey(participationId)`               |
| Caller-ID verification       | `caller-id-verification:<numberId>:<requestedAt>`                  |
| Auto-reload (Stripe side)    | `autoreload:<settingsId>:<minute>`                                 |
| AI chat / summary / pipeline | `incurredCostDebitRef(...)` — unique per invocation                |

`ref` is **required**. Two shapes, and picking the wrong one is a real bug:

- **Keyed on the thing paid for** (`<subject>:<row id>`) when a provider can
  redeliver the same settlement event. A duplicate must be refused.
- **Unique per invocation** (`incurredCostDebitRef`) when the cost was already
  incurred upstream — an AI completion the provider has already billed us for.
  Running twice means we were charged twice, so both belong in the ledger.

Using a stable key for the second kind silently swallows real costs; using a
unique key for the first kind double-charges the customer.

## Where a call's price comes from

Telnyx sends `call.cost` with `cost_parts`. `calculateCallCharge`:

1. Sums every non-`call-recording` part → `rawCallCost`.
2. Sums the `call-recording` parts → `rawRecordingCost`.
3. Multiplies each by its own margin.
4. Falls back to `total_cost` as voice cost when `cost_parts` is absent.

The full breakdown, both multipliers, the pre-charge balance and the computed
total are persisted into `Call.costMeta.ringeeCostBreakdown` — that is the audit
trail for any billing dispute.

Settlement is guarded twice: a non-null `Call.totalCost` short-circuits a
duplicate webhook, and the ledger key catches anything that slips past.

## Auto-reload and monthly funding

Two distinct products:

- **Auto-reload** — balance-triggered. Requires a saved card and a recorded
  consent timestamp, and does not charge at setup (`BILL-007`). When the balance
  drops below the threshold, an atomic `active -> charging` CAS elects exactly one
  concurrent debit to start the charge. The winner **stays** `charging`; only the
  confirmed webhook credits and re-arms to `active` — re-arming earlier would let
  another consume start a second charge before the credit lands (`BILL-006`).
- **Monthly fund** — a Stripe subscription. Its cycles land on the same
  `creditTopupOnce` path.

Failures move the status to `failed` or `requires_payment_method` and stop firing
until the user acts (`BILL-008`).

## Where a call is refused for money

| Point            | Check                              | On failure                        |
| ---------------- | ---------------------------------- | --------------------------------- |
| Dial pre-flight  | balance, `canCall`, caller ID, DNC | refuse the request                |
| `call.initiated` | `ensureCallAffordable`             | hang up the live leg              |
| `call.answered`  | `enforceAnsweredCreditPolicy`      | hang up, or cap at 5 min under $2 |

Three points, not one, because the browser places the WebRTC leg itself and can
skip any purely client-side gate.

## Telling the customer the balance is running out

Every ledgered debit passes through `CreditBalanceAlertService`, which alerts
only when _that_ debit crossed a threshold (`BILL-019`). Crossing — rather than
"is currently below" — is what makes each tier fire once per drop and re-arm
after a top-up: a balance can only cross downwards again once a top-up has
lifted it back over, so no alert state is needed to get that right.

On top of the crossing test, `isFirstDelivery` claims a Redis marker
(`credit:balance-alert:<org:id|user:id>:<tier>`, `SET NX` with a one-hour TTL)
and stays silent when the key is already there. That is a race guard for two
debits committing in the same instant, not the re-arm mechanism — but it is
real per-workspace state, and it does swallow a second genuine crossing of the
same tier within the hour. If Redis is unreachable the send goes ahead: a
customer who cannot call must hear about it even when the dedupe is down.

| Tier            | Organization | Personal | What the customer is told                       |
| --------------- | ------------ | -------- | ----------------------------------------------- |
| `early_warning` | $5           | —        | top up at your leisure; nothing has changed yet |
| `call_cap`      | $2           | $2       | answered calls are now cut off at 5 min         |
| `depleted`      | $0           | $0       | the workspace is inactive; calls are refused    |

Organizations get the extra $5 tier because topping one up is not a one-click
card tap — an admin has to notice first. Recipients are the org admins, or the
owner of a personal workspace; delivery is email plus a push to every registered
device.

The thresholds live in `packages/services/src/services/credit-policy.ts`,
**shared with the call gate that enforces them**. The email that says "cut off
at 5 minutes" is only true while `CallService` caps calls at exactly that
balance for exactly that long — keep them in one place.

## Stripe

`StripeService` (`@ringee/platform`) owns the SDK. `stripe.controller.ts` handles
the webhook and may import Stripe **types only**. Handled events include
`checkout.session.completed` (top-ups, org subscriptions, and `mode: "setup"`
card changes), subscription lifecycle, invoice paid/failed, `payment_intent.*`
and `setup_intent.*`.

Signature verification runs over `req.rawBody` before anything else, and a
failure returns 400 without touching state (`HOOK-001`).

## Free trial

`User.freeCallTrial` bypasses the pre-call and on-answer credit gates. Note that
the `call.cost` handler charges regardless — see `BILL-018`, flagged
**`Needs confirmation`**, because a trial user can therefore go negative.

## Adding a new billable operation

1. Price it in a pure, tested function (`call-cost.util.ts` is the model).
2. Debit through `consumeCredits` with an idempotency ref.
3. Persist the breakdown next to the row you charged for.
4. Decide the pre-check: is a zero balance a refusal, a degraded mode, or nothing?
5. Add a margin env var and validate it in `@ringee/configuration`.
