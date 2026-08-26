# packages/database — persistence rules

Prisma schema, generated client, and one repository per aggregate. This is the
only package that may import `@prisma/client` (ESLint `ARCH-002`); everything
else imports models, enums and `Prisma` types from `@ringee/database`.

## Repositories

- One repository per aggregate, exported from `repositories/index.ts`.
- Repositories do persistence, not business decisions. Validation, pricing,
  eligibility and authorization belong in `@ringee/services`.
- Every workspace-scoped query filters with `buildOwnershipFilter(ctx)`. A
  bare `findUnique({ where: { id } })` on a tenant-owned row must be followed by
  an ownership check in the caller — prefer a scoped finder instead.
- Multi-step writes that must not half-apply use `prisma.$transaction`. The
  credit ledger methods (`consumeOnce`, `grantOnce`, `topupOnce`) are the
  reference shape: unique idempotency key + balance change in one transaction.
  Only a `P2002` on that key's own columns (`idempotencyKey` for the debit and
  grant ledgers, `stripeCheckoutSessionId` / `stripePaymentIntentId` for a
  top-up) is caught and reported as "already applied". Every other unique
  violation — including another `P2002` in the same transaction, such as two
  requests racing to create the workspace's `Credit` row — is rethrown, so a
  real write is never silently dropped.
- Concurrent counters use atomic `{ increment }`, never read-modify-write.
- Queue claims use `SELECT FOR UPDATE SKIP LOCKED` (`lockNextLead`).

## Schema

- IDs are UUIDs. Tenant-owned models carry `userId` **and** nullable
  `organizationId`; personal rows have `organizationId: null`.
- Soft deletes use `deletedAt` (contacts, tags, caller IDs, call sessions).
  Respect it in queries.
- Enums are public contracts — the frontend, MCP tools, the SDK and Custom
  Integration payloads all read them. Adding a value is safe; renaming or
  removing one breaks consumers.
- After editing `schema.prisma`, run `pnpm prisma:generate`.

## Migrations — check the current state before assuming

Three directories exist: `prisma/migrations/`, `prisma/migrations-pending/` and
`prisma/pending-migrations/`. `prisma/migrations/` is **git-ignored**, so the
migrations actually tracked in this repository live in the two "pending" folders.
There is also no working `pnpm prisma:migrate` script.

Do not invent a migration workflow from this layout, and do not "tidy" the
folders as a side effect of another task. Ask which folder a new migration
belongs in. See `docs/engineering/ARCHITECTURE_DEBT.md` (`DEBT-002`).
