# packages/platform — adapter & cross-cutting rules

Everything Ringee needs from the outside world, plus shared primitives (auth,
Redis, realtime, DTOs, crypto, Temporal client). This package is the **only**
place a third-party SDK may be imported (ESLint `ARCH-001`).

## Provider adapters

Each provider gets a folder with an interface and an implementation:

| Concern | Interface / registry | Implementation |
|---|---|---|
| Telephony | `telephony/interfaces/telephony.service.ts` | `telephony/telnyx/` |
| Payments | `stripe/stripe.service.ts` | Stripe SDK |
| Auth | `auth/clerk/` | Clerk |
| Storage | `upload/upload.interface.ts` | `cloudflare.storage` / `local.storage` |
| Email | `email/email.interface.ts` | `resend.provider` / `empy.provider` |
| CRM | `crm/provider.ts` + `crm/registry.ts` | `crm/providers/*` |
| Enrichment | `enrichment/provider.ts` + registry | `enrichment/providers/*` |
| AI | `ai-agents/ai-provider.registry.ts` | `ai-agents/providers/*` |

When adding a provider capability:

1. Add it to the interface first, then implement it in the adapter.
2. Return Ringee-shaped values. Do not return the SDK's own objects, and do not
   re-export provider enums for the domain to switch on.
3. If the provider cannot answer, say so explicitly (`null`) rather than guessing
   — `isCallAlive` is the reference for this.

`TelephonyService` is a dispatcher with a single `telnyx` case today. Keep new
work behind it; that switch is where a second carrier plugs in.

## Auth primitives

`auth/ownership.types.ts` is the tenancy contract for the whole product:
`createOwnershipContext`, `buildOwnershipFilter`, `buildOwnershipData`,
`resolveMemberFilter`, `createDashboardContext`. Do not write a second filter
helper — fix this one.

`auth/auth.guard.ts` (`AuthGuard`) is unused legacy with a hard-coded JWT secret.
Do not wire it into anything; see `docs/engineering/ARCHITECTURE_DEBT.md`.

## Secrets and signatures

- Read configuration through `@ringee/configuration`, never `process.env` for a
  credential.
- Verification helpers already exist and are canonical: `TelnyxWebhookVerifier`
  (Ed25519), `custom-integrations/webhook-signing.util` (HMAC, constant-time),
  `custom-integrations/api-key.util` (hash + `timingSafeEqual`),
  `sdk/publishable-key` (signed, revocable via key prefix).
- Compare secrets with `timingSafeEqual`. Store hashes, never plaintext tokens.
- Fail closed when a key is missing or a signature does not verify.

## Temporal

`temporal/contracts.ts` must stay **import-free** — it is pulled into the
workflow sandbox. `OrchestratorService` is how the rest of the system starts
durable work.
