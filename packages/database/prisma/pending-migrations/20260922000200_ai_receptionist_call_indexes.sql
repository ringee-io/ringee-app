-- AI receptionist (20260922000100) — the `Call` index for the stalled-handoff
-- sweep.
--
-- RUN BY HAND with psql, after 20260922000100_ai_receptionist.sql. Never through
-- `prisma migrate deploy`: CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block, and Prisma wraps each migration file in one. A plain
-- CREATE INDEX would block writes to `Call` — every live call — for the build.
--
-- `findStalledInboundTransfers` runs on every stale-call sweep. Without this
-- index it scans all of `Call`; the partial index holds only the handoffs still
-- open, so it stays a handful of rows however large `Call` grows.
--
-- Prisma cannot express a partial index, so it is not in schema.prisma. A
-- generated migration that proposes to drop it must have that statement
-- removed.
--
-- A CONCURRENTLY build that fails leaves an INVALID index behind. Find it with
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- then DROP INDEX CONCURRENTLY "<name>"; and run this statement again.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Call_open_inboundTransferRequestedAt_idx"
  ON "Call" ("inboundTransferRequestedAt")
  WHERE "inboundTransferRequestedAt" IS NOT NULL AND "endedAt" IS NULL;
