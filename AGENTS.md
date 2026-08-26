# AGENTS.md

Operating rules for AI agents and contributors working on Ringee.
Deep system knowledge lives in `docs/engineering/` — read it when a task touches
that domain, not before.

## Product nature

Ringee is a **production communications platform**: real phone calls, real money,
real tenant data. A change is only correct if it preserves reliability, workspace
isolation, billing correctness, backwards compatibility with existing consumers,
and the ability to swap providers.

Providers are infrastructure, not the domain. **Telnyx is a provider, not the
Ringee domain.** Same for Stripe, Clerk, Deepgram, Apollo/Prospeo, OpenAI.

## Before changing code

1. Read the existing implementation of the thing you are about to change.
2. **Search before creating.** Before adding a service, repository, hook, util,
   component, DTO, type, guard or API client, search for the existing owner of
   that responsibility. See `docs/engineering/CANONICAL_IMPLEMENTATIONS.md`.
3. Identify the current owner of the responsibility and extend it instead of
   adding a second one.
4. Check the callers and consumers of anything you change (`grep` the symbol).
5. Understand the whole flow the change sits in — a dial, a webhook, a debit.
6. Make the smallest coherent change. Do not refactor unrelated code.

## Architecture

Request flow: **frontend → `/api` controller → `@ringee/services` → `@ringee/database`**.
`@ringee/platform` supplies cross-cutting concerns and every external-provider
adapter, injected through NestJS DI.

- Do not skip a layer. Controllers stay thin: authenticate, build the ownership
  context, delegate, shape the response.
- Business logic belongs in `@ringee/services`, never in a controller, a React
  component, or a Prisma repository.
- Database access goes through repositories in `@ringee/database`.
- Do not build a parallel architecture next to an existing one.
- Provider SDKs are imported only inside their `@ringee/platform` adapter.
  ESLint enforces this (`ARCH-001`..`ARCH-004` in `eslint.config.mjs`).

Directory-level rules exist where a domain needs them — read the nearest one:
`apps/backend`, `apps/frontend`, `apps/orchestrator`, `apps/attio`,
`packages/services`, `packages/platform`, `packages/database`,
`packages/dialer-core`, `packages/dialer-sdk`, `packages/agent`.

## Business rules

Rules found in the code are **system constraints**, catalogued with stable IDs in
`docs/engineering/BUSINESS_RULES.md`. They are not obstacles to route around.

- Never remove, weaken or bypass a rule to make an implementation easier.
- If a feature genuinely requires changing one, say so explicitly, name the rule
  ID, and change the rule deliberately — including its documentation.
- A rule marked `Needs confirmation` is unverified: do not treat it as binding,
  and do not silently make it binding either.

## Workspace isolation

Every workspace-scoped read and write goes through the ownership context:
`createOwnershipContext(user)` → `buildOwnershipFilter(ctx)` (`@ringee/platform`).

- An organization scope filters by `organizationId`; a personal scope filters by
  `userId` **and** `organizationId: null`. Never mix them.
- Never look a resource up by its id alone and act on it. Load it, then verify it
  belongs to the caller's workspace.
- Never trust a `userId`, `organizationId`, `memberId` or resource id sent by the
  client as an authorization claim. Derive identity from the auth layer.
- Frontend role checks (`useOrgRole`, `RoleGuard`) are UX only. The server-side
  guard is the boundary.

## External providers

- Keep provider types, enums and states behind the adapter. Where a normalization
  layer already exists, it is canonical — use it instead of re-reading raw
  provider payloads.
- Where provider types have already leaked into the domain (call webhooks), do
  not widen the leak. See `docs/engineering/ARCHITECTURE_DEBT.md`.
- Provider credentials come from `@ringee/configuration`, never from a literal.

## Critical operations

Calls, credits, campaigns, webhooks and outbox deliveries are all retried.
Retries must never produce a duplicate call, charge, balance mutation, or event.

- Every credit mutation goes through `CreditService`. Money in:
  `creditTopupOnce` (Stripe) or `grantCreditsOnce` (non-purchase grants). Money
  out: `consumeCredits` **with an idempotency ref**. The ledger row and the
  balance move in one transaction.
- Webhook handlers must be safe to replay; guard on a stored marker (a ledger
  key, a settled `totalCost`, a status transition) before causing a side effect.
- One call at a time per user is enforced by `ConcurrentCallGuardService`. Any
  new dial surface must go through it.

## Security

Never: commit or log secrets, credentials, tokens or raw recordings; trust
frontend authorization; skip a validation to unblock yourself; accept a webhook
without verifying its signature; or widen `@Public()` beyond what a route needs.

Every `@Public()` route must carry its own proof of authorization — a verified
provider signature, a hashed magic-link token, an SDK session, or an API key.

## Backwards compatibility

Shared contracts have consumers inside this repo. Before changing one, check all
of them: the web app, the Chrome extension (`apps/browser-extension`), the Dialer
SDK (`packages/dialer-sdk`, published), the CLI (`apps/agent-cli`), the Attio app
(`apps/attio`), the ChatGPT app, the MCP tool surface (`packages/agent`,
`apps/backend/src/mcp`), and outbound Custom Integration webhooks
(`packages/platform/src/custom-integrations/event-spec.ts`).

Prisma enums, REST response shapes, MCP tool schemas, SDK exports and webhook
event payloads are all public contracts. Additive changes are safe; renames and
removals are not.

## Definition of Done

Run what your change actually touches (see `docs/engineering/ARCHITECTURE.md` for
the full command list):

```bash
node_modules/.bin/eslint <changed paths>   # or: pnpm lint (repo-wide)
pnpm --filter <workspace> run test         # services, platform, dialer-core, dialer-sdk, agent, browser-extension
pnpm --filter <workspace> run typecheck    # dialer-*, agent, agent-cli, browser-extension, chatgpt-app
pnpm build:backend | build:frontend | build:database | build:orchestrator
pnpm prisma:generate                       # after any schema.prisma change
```

The lint baseline is **not** clean (pre-existing `no-explicit-any` /
`no-unused-vars` / prettier findings). Do not "fix" unrelated ones; just make
sure you add none. Never invent a command — read `package.json`.

## Keeping these rules current

When you discover a recurring architectural mistake or an undocumented invariant
while implementing a task, update the right `AGENTS.md` or the matching document
under `docs/engineering/`. Only capture **durable** knowledge — a one-off bug is
a commit message, not a rule.
