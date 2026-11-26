# Financial protection and outbound dispatch

Updated 2026-11-24. This checkout contained balance gates and an idempotent debit
ledger, but no earlier standalone financial-protection document or credit-hold
implementation was found. This document records what is actually implemented;
it does not assume work in another checkout is present.

`CreditService` remains the sole financial entry point. Existing provider CDR and
AI-usage settlement keys continue to determine charges. The CPS calculator is
internal forecasting and never creates a customer debit or surcharge.

The current implementation adds `CreditReservation` through the existing
`CreditRepository`. Queue-enabled AI requests hold no funds while waiting.
Dispatch reserves a configurable admission estimate (default USD 0.10), split
between `call-cost:<callId>` and `ai-voice-agent-cost:<agentCallId>`. Holds and
debits serialize on the credit row. Holds do not change the displayed ledger
balance or price. Each actual debit settles its matching hold atomically;
unrelated holds remain intact. Definitively unplaced calls release their holds.
Ambiguous calls retain bounded holds for reconciliation, never automatic redial.
An inline denial proven to occur before provider HTTP releases its holds and
atomically retires its failed operation's idempotency binding, permitting the
same-key capacity retry. Other failed operations and ambiguous provider replies
retain that binding. Enqueue pool/transaction pressure returns a temporary 503;
a stable-key replay recovers an operation whose commit acknowledgement was lost.

The queue and inline AI admission share the configurable live-call cap, default
25 per workspace. This is independent of account CPS, workspace automated CPS,
and the existing human-call concurrency rules. Pending queue work is durable,
bounded and cancellable. Provider pacing occurs again at actual HTTP egress.

Important limits of the protection:

- USD 0.10 is an admission estimate, not a route/token/recording-derived maximum
  cost. A call can cost more. A late debit still records actual usage and can
  make the balance negative; expiry is not debt forgiveness.
- Existing human browser, SIP and non-call billable paths do not yet reserve
  through this new admission path. Their spending can consume funds held for
  AI calls. Full cross-product admission is not established by these tests.
- Free-trial treatment remains the pre-existing policy; it was not silently
  converted into a new financial rule.
- The new tables must be applied manually before releasing the binary. Nothing
  runs migrations in deployment workflows or application startup.

**Financial release recommendation: NO-GO for a comprehensive maximum-exposure
guarantee.** Finish cost-derived admission/duration budgets and full reservation
coverage, or separately approve a narrowly described admission-buffer policy.
Do not represent this estimate as complete gross-margin protection.

See [telnyx-cps-cost-protection.md](telnyx-cps-cost-protection.md) for the outbound
path audit, distributed limiter, operational controls, testing evidence and
global CPS release blockers. Local changes were not committed, deployed or used
to make paid calls.
