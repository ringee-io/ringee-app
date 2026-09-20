-- Inbound routing (20260920000000) — the `Call` indexes and foreign keys.
--
-- RUN BY HAND with psql, one statement at a time. Never through
-- `prisma migrate deploy` and never move this file into prisma/migrations/:
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and Prisma
-- wraps each migration file in one.
--
-- Why it is separate: `Call` is written on every live call. A plain
-- CREATE INDEX holds a lock that blocks those writes for the whole build, and
-- ADD FOREIGN KEY validates the entire table under a lock of its own — a pause
-- in call handling for as long as both take. CONCURRENTLY, then NOT VALID,
-- then VALIDATE does the same work while calls keep flowing.
--
-- Order:
--   1. Remove the three `Call` CREATE INDEX statements and the three
--      `ALTER TABLE "Call" ADD CONSTRAINT ... FOREIGN KEY` statements from
--      20260920000000_inbound_routing/migration.sql.
--   2. Apply that migration (ADD COLUMN on nullable columns is metadata-only,
--      the new tables are empty — it is fast).
--   3. Run this file, statement by statement.
--
-- A CONCURRENTLY build that fails leaves an INVALID index behind. Find it with
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- then DROP INDEX CONCURRENTLY "<name>"; and run that statement again.

-- ── 1. Indexes ──────────────────────────────────────────────────────────────
-- One per foreign key: without them every InboundRoute, RingGroup or User
-- delete seq-scans Call to apply ON DELETE SET NULL.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Call_inboundRouteId_idx"
  ON "Call" ("inboundRouteId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Call_ringGroupId_idx"
  ON "Call" ("ringGroupId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Call_answeredByUserId_idx"
  ON "Call" ("answeredByUserId");

-- ── 2. Foreign keys, unvalidated ────────────────────────────────────────────
-- NOT VALID needs a brief ACCESS EXCLUSIVE lock and no table scan: the
-- constraint applies to new and changed rows the moment it lands. The lock
-- timeout is what keeps that brief moment from queueing behind a long
-- transaction and blocking every writer behind it — on a timeout, retry.

SET lock_timeout = '3s';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Call_inboundRouteId_fkey' AND conrelid = '"Call"'::regclass) THEN
    ALTER TABLE "Call" ADD CONSTRAINT "Call_inboundRouteId_fkey"
      FOREIGN KEY ("inboundRouteId") REFERENCES "InboundRoute"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Call_ringGroupId_fkey' AND conrelid = '"Call"'::regclass) THEN
    ALTER TABLE "Call" ADD CONSTRAINT "Call_ringGroupId_fkey"
      FOREIGN KEY ("ringGroupId") REFERENCES "RingGroup"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Call_answeredByUserId_fkey' AND conrelid = '"Call"'::regclass) THEN
    ALTER TABLE "Call" ADD CONSTRAINT "Call_answeredByUserId_fkey"
      FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

RESET lock_timeout;

-- ── 3. Validation ───────────────────────────────────────────────────────────
-- SHARE UPDATE EXCLUSIVE: reads and writes carry on while the scan runs. The
-- three columns are still NULL on every existing row, so every row passes —
-- this is a full scan, not a rewrite. Run them one at a time, off-peak.

ALTER TABLE "Call" VALIDATE CONSTRAINT "Call_inboundRouteId_fkey";

ALTER TABLE "Call" VALIDATE CONSTRAINT "Call_ringGroupId_fkey";

ALTER TABLE "Call" VALIDATE CONSTRAINT "Call_answeredByUserId_fkey";

-- ── 4. Check ────────────────────────────────────────────────────────────────
-- Three valid indexes, three validated constraints.
--
--   SELECT indexrelid::regclass AS index, indisvalid
--     FROM pg_index
--    WHERE indrelid = '"Call"'::regclass
--      AND indexrelid::regclass::text IN (
--            '"Call_inboundRouteId_idx"', '"Call_ringGroupId_idx"',
--            '"Call_answeredByUserId_idx"');
--
--   SELECT conname, convalidated
--     FROM pg_constraint
--    WHERE conrelid = '"Call"'::regclass
--      AND conname LIKE 'Call_%_fkey';
