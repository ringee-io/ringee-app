# packages/services — domain rules

Where Ringee's business logic lives. Consumed by `apps/backend` (HTTP), the
Temporal activities in `apps/orchestrator`, and the MCP tool layer.

Every service takes an `OwnershipContext` and enforces the workspace rule itself.
Never assume the caller already checked.

## Billing — read `docs/engineering/BILLING.md` before touching credits

`CreditService` is the **only** way a balance moves. There are exactly three doors:

| Direction | Method | Ledger |
|---|---|---|
| Purchase in | `creditTopupOnce` — Stripe webhook only | `CreditTopup` |
| Grant in | `grantCreditsOnce` — offers, promos, goodwill | `CreditGrant` |
| Out | `consumeCredits(ctx, amount, ref)` | `CreditDebit` |

- The ledger row and the balance move in **one transaction**; a duplicate
  idempotency key returns `debited: false` / `granted: false` and leaves the
  balance alone. Gate side effects on that boolean.
- Always pass an idempotency `ref` when debiting. The convention is
  `<subject>:<row id>` with a `source` naming the trigger
  (`call-cost:<callId>` / `telnyx.call.cost`).
- Never write `prisma.credit.update` from a service. Never credit a balance from
  anywhere but the confirmed Stripe webhook.
- Auto-reload charges are started by an atomic `active -> charging` CAS and are
  credited only by the webhook. Do not re-arm to `active` anywhere else.

## Telephony — read `docs/engineering/TELEPHONY.md`

- Provider commands go through `TelephonyService` (`@ringee/platform`), never a
  Telnyx SDK import (ESLint `ARCH-001`).
- `CallService.handleTelnyxEvent` owns the call lifecycle and is the single
  writer of `Call.status`. Do not transition call state from elsewhere.
- One call at a time per user is `ConcurrentCallGuardService`. Every dial surface
  reserves through `requestDial`, binds on `call.initiated`, and releases on
  hangup. A new surface that skips it is a bug, not a shortcut.
- `isCallAlive()` returning `null` means "could not tell" — it must never be read
  as "the call ended".

## Campaigns and outbound

- Campaigns are organization-only: `ensureOrganization(ctx)` first.
- Load the campaign, compare `campaign.organizationId` to `ctx.organizationId`,
  and check `campaignMemberRepo.isMember` for non-admins before returning it.
- Leads are claimed with `SELECT FOR UPDATE SKIP LOCKED`
  (`CampaignLeadRepository.lockNextLead`). Never hand-roll lead selection.
- Dialing must respect the calling window (`ComplianceService.isWithinCallingWindow`)
  and DNC scope. Personal and org DNC lists are never queried together.
- Campaign calls go through the same credit, concurrency and caller-ID gates as
  manual calls. Campaigns get no exemptions.

## Adding a service

Search first — `index.ts` lists every existing service, and several domains are
already split into subfolders (`outbound/`, `sdk/`, `crm/`, `ai-pipeline/`,
`offers/`, `security/`, `transcription/`). Extend the owner of the responsibility
rather than adding a second service for the same concept, and export it from the
domain barrel so `@ringee/services` stays the single entry point.
