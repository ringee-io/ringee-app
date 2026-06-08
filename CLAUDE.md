# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ringee is an open-source, self-hostable VoIP communication platform for browser-based international voice calling. It provides contact management, call recording, team analytics, campaigns, and multi-tenant organization support. Telephony is powered by Telnyx, authentication by Clerk, payments by Stripe.

## Monorepo Structure

pnpm workspaces monorepo (`pnpm@10.16.1`). Two workspace roots: `apps/*` and `packages/*`.

**Apps:**
- `apps/backend` — NestJS REST API (port 3000), global prefix `/api`, Clerk auth guard
- `apps/worker` — NestJS background job processor (shares same packages)
- `apps/frontend` — Next.js 15 B2B admin dashboard (port 4200, React 19, App Router)

**Packages (shared libraries):**
- `@ringee/database` — Prisma ORM client, schema, migrations (`packages/database/prisma/schema.prisma`)
- `@ringee/platform` — Shared NestJS modules: auth (Clerk), Redis, email (Resend), storage (S3/R2), Stripe, telephony (Telnyx), notifications (Firebase), AI (OpenAI), crypto
- `@ringee/services` — Domain services: call, contact, campaign, credit, subscription, recording, dashboard, onboarding, etc.
- `@ringee/configuration` — Centralized env var config with startup validation (built with SWC)
- `@ringee/frontend-shared` — Shared React components, hooks, types, utilities

## Common Commands

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL 17 + Redis 7.4)
docker-compose up -d

# Run database migrations
pnpm prisma:migrate

# Generate Prisma client (also runs on postinstall)
pnpm prisma:generate

# Development (backend + frontend in parallel)
pnpm dev

# Individual app dev
pnpm dev:backend          # NestJS watch mode with .env from root
pnpm dev:frontend         # Next.js on :4200
pnpm dev:worker           # Worker watch mode

# Build
pnpm build                # Build all packages and apps
pnpm build:backend        # Build backend only
pnpm build:frontend       # Build frontend only
pnpm build:database       # Build database package only

# Lint
pnpm lint                 # ESLint across entire repo

# Run built apps
pnpm start:backend        # node apps/backend/dist/apps/backend/src/main
pnpm start:frontend       # next start --port 4200
```

## Architecture Details

**Request flow:** Frontend (Next.js) -> `/api/*` (NestJS backend) -> `@ringee/services` (domain logic) -> `@ringee/database` (Prisma/PostgreSQL). Platform modules (`@ringee/platform`) provide cross-cutting concerns injected via NestJS DI.

**Backend API:** Controllers in `apps/backend/src/api/routes/` delegate to services in `packages/services/src/services/`. Global Clerk auth middleware + `ClerkAuthGuard` protect all routes. Raw body parsing enabled for `/webhooks/clerk` (Clerk webhook verification). CORS configured for frontend origins.

**Multi-tenancy:** Users belong to Organizations via OrganizationMembership. Most entities (calls, contacts, numbers, credits, campaigns) have both `userId` and optional `organizationId` fields. Clerk handles org-level auth.

**TypeScript path aliases:** `@ringee/*` maps to `packages/*/src` and `@ringee/components/*` maps to `packages/components/src/*` (tsconfig.json).

**Environment config:** All env vars defined in `.env` at repo root. Backend reads via `@ringee/configuration` which validates required vars at startup and exits on missing ones. Frontend apps use `dotenv -e ../../.env` to load from root. See `.env.example` for the full list.

**Database:** PostgreSQL 17 via Prisma. Schema at `packages/database/prisma/schema.prisma`. Key models: User, Organization, Call, Contact, Campaign, NumberPurchased, Credit, Subscription, Recording, Tag. All IDs are UUIDs. Soft deletes via `deletedAt` on contacts, tags, caller IDs.

**Frontend:** Next.js App Router with feature-based organization (`src/features/`). UI built on Radix UI primitives + Tailwind CSS 4. State management with Zustand. Forms with React Hook Form + Zod. WebRTC calling via `@telnyx/webrtc`. Push notifications via Firebase.

**Telephony:** Telnyx for call control, number purchasing, and WebRTC. Call costs tracked with profit margins. Rate data stored in `TelnyxRatePerMinute` table.

**Lint/Format:** ESLint 9 flat config + Prettier. Husky + lint-staged runs Prettier on commit for staged JS/TS/CSS files.
