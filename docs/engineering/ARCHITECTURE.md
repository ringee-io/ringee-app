# Architecture

Ringee is an open-source, self-hostable VoIP platform: browser-based international
calling, contact management, outbound campaigns, recordings, transcription, CRM
sync and multi-tenant organizations.

## Workspaces

pnpm workspaces (`pnpm@10.16.1`), roots `apps/*` and `packages/*`.

### Apps

| App                      | Package name             | What it is                                                                                                                                    |
| ------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/backend`           | `backend`                | NestJS REST API, port 3000, prefix `/api`. Also hosts the MCP server, the TriggerLoop module, the realtime gateways and the dialer poll loop. |
| `apps/orchestrator`      | `@ringee/orchestrator`   | Temporal worker: durable workflows + periodic Schedules.                                                                                      |
| `apps/frontend`          | `frontend`               | Next.js 15 dashboard, port 4200, React 19, App Router.                                                                                        |
| `apps/browser-extension` | `browser-extension`      | Chrome extension (click-to-dial, side panel, offscreen WebRTC).                                                                               |
| `apps/agent-cli`         | `ringee`                 | Published CLI driving the Ringee MCP tools.                                                                                                   |
| `apps/chatgpt-app`       | `@ringee-io/chatgpt-app` | ChatGPT Apps SDK surface + widget renderer.                                                                                                   |
| `apps/attio`             | `ringee-io`              | Attio CRM app (own SDK, own rules — see `apps/attio/AGENTS.md`).                                                                              |
| `apps/sdk-playground`    | —                        | Static playgrounds exercising the published Dialer SDK bundle.                                                                                |

### Packages

| Package                   | Role                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `@ringee/database`        | Prisma schema, generated client, ~90 repositories. Sole importer of `@prisma/client`. |
| `@ringee/platform`        | Cross-cutting concerns + every external-provider adapter.                             |
| `@ringee/services`        | Domain services — the business logic.                                                 |
| `@ringee/configuration`   | Env config with fail-fast startup validation (built with SWC).                        |
| `@ringee/frontend-shared` | Shared React components, hooks, API client.                                           |
| `@ringee/dialer-core`     | Framework-free browser call engine, phone normalization, DTMF, call store.            |
| `@ringee/dialer-sdk`      | Published embeddable SDK (`@ringee/dialer-sdk`).                                      |
| `@ringee/dialer-ui`       | React UI on top of dialer-core.                                                       |
| `@ringee-io/agent`        | MCP tool catalog, schemas, prompts, agent safety rules.                               |

## Layers

```
browser / extension / SDK / CLI / MCP client
        │  HTTP  /api/*
        ▼
apps/backend  ── controllers (thin) ── guards ── DTO validation
        │
        ▼
@ringee/services ── business logic, ownership enforcement, idempotency
        │                     │
        ▼                     ▼
@ringee/database      @ringee/platform ── provider adapters
   Prisma/Postgres         Telnyx · Stripe · Clerk · Deepgram · S3/R2
                           Resend · Firebase · OpenAI/Anthropic · Apollo/Prospeo

apps/orchestrator ── Temporal worker ── activities → @ringee/services
```

Layer rules are enforced statically — see `ARCH-001`..`ARCH-004` in
`eslint.config.mjs`.

## Runtime pieces

- **HTTP API** — global `ClerkAuthGuard`; `@Public()` opts out. Raw body enabled
  for webhook signature verification.
- **Temporal** — the backend starts workflows through `OrchestratorService`;
  the orchestrator runs them and owns the Schedules (retry/callback/reminder
  pollers, CRM/enrichment/custom-integration drains, sweeps, health recompute).
  Contracts are shared in `packages/platform/src/temporal/contracts.ts`.
- **Redis** — caching, the one-call-at-a-time dial lease, orphan webhook parking.
- **Realtime** — a per-user WebSocket gateway (`/ws/user-events`), a Telnyx media
  stream socket (`/media-stream`), and in-process SSE for dialer lead assignment.
- **Storage** — recordings: a public mp3 copy plus an encrypted private copy,
  keyed per workspace.

## Data model

PostgreSQL 17 via Prisma, `packages/database/prisma/schema.prisma` (~3.9k lines).
UUID primary keys. Tenant-owned rows carry `userId` plus nullable
`organizationId`; a personal row has `organizationId: null`. Soft delete via
`deletedAt` on contacts, tags, caller IDs and call sessions.

Core aggregates: `User`, `Organization`, `OrganizationMembership`, `Call`,
`CallAttempt`, `Contact`, `Company`, `Campaign`, `CampaignLead`,
`NumberPurchased`, `Credit` (+ `CreditDebit` / `CreditGrant` / `CreditTopup`),
`Subscription`, `Recording`, `CallTranscription`, `CallSession`, `DNCEntry`,
`CrmConnection`, `CustomIntegration`, `EnrichmentConnection`, `Offer`.

## Commands

Discovered from `package.json`. Do not invent others.

```bash
pnpm install
docker-compose up -d          # Postgres 17 + Redis 7.4 + Temporal (+ UI :8080)

pnpm dev                      # backend + frontend
pnpm dev:backend | dev:frontend | dev:orchestrator | dev:attio
pnpm dev:agent-cli | dev:chatgpt-app | dev:browser-extension

pnpm build                    # every workspace
pnpm build:backend | build:frontend | build:database | build:orchestrator
pnpm build:agent | build:agent-cli | build:chatgpt-app

pnpm lint                     # eslint . across the repo
pnpm test                     # pnpm run -r test

pnpm prisma:generate
pnpm prisma:format
```

### Per-workspace checks

| Workspace                                          | test                              | typecheck |
| -------------------------------------------------- | --------------------------------- | --------- |
| `@ringee/services`                                 | node:test over `src/**/*.spec.ts` | —         |
| `@ringee/platform`                                 | vitest                            | —         |
| `@ringee/dialer-core`                              | vitest                            | ✔        |
| `@ringee/dialer-sdk`                               | vitest                            | ✔        |
| `@ringee-io/agent`                                 | node --test                       | ✔        |
| `browser-extension`                                | vitest                            | ✔        |
| `@ringee/dialer-ui`, `ringee` (CLI), `chatgpt-app` | —                                 | ✔        |

There are 29 test files / 244 tests, concentrated where a mistake costs money or
duplicates a call: `call-cost.util`, `credit.repository`,
`concurrent-call-guard`, the offers engine, the AI-pipeline credit service, the
dialer engine, phone normalization (browser and server) and the carrier event
normalizer.

### Known command gaps

- `pnpm prisma:migrate` is **broken**: it delegates to a `prisma:migrate` script
  that does not exist in `packages/database/package.json`. What exists there is
  `prisma-db-push`, `db:deploy`, `prisma:generate`, `prisma-format`, `seed:offers`.
- `pnpm lint` is not clean at baseline (~5k findings in source, overwhelmingly
  prettier formatting and unused vars). Add none; do not mass-fix unrelated ones.
- `pnpm test` runs `-r test`, and several workspaces have no `test` script.

## Configuration

All env vars live in `.env` at the repo root (`.env.example` documents them).
`@ringee/configuration` validates required vars at import time and calls
`process.exit(1)` when any are missing — including `DATABASE_URL`, `REDIS_URL`,
Clerk, Telnyx and Stripe credentials. Frontend apps load the root `.env` through
`dotenv -e ../../.env`.
