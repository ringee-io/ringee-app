-- Workspace dispositions (20261002180000) — the `Call` / `CallAttempt` indexes
-- and the `Call` foreign key.
--
-- RUN BY HAND with psql, one statement at a time. Never through
-- `prisma migrate deploy` and never move this file into prisma/migrations/:
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and Prisma
-- wraps each migration file in one.
--
-- Why it is separate: `Call` is written on every live call and `CallAttempt` on
-- every campaign dial. A plain CREATE INDEX holds a lock that blocks those
-- writes for the whole build, and ADD FOREIGN KEY validates the entire table
-- under a lock of its own. CONCURRENTLY, then NOT VALID, then VALIDATE does the
-- same work while calls keep flowing.
--
-- Order:
--   1. Apply 20261002180000_workspace_dispositions (metadata-only column adds,
--      one new empty table — it is fast). It already leaves out the statements
--      below.
--   2. Run this file, statement by statement. Sections 1 and 2 can follow the
--      migration immediately; section 3 can wait for an off-peak window.
--
-- Nothing reads through these before a workspace starts using dispositions:
-- they serve the "is this disposition in use" check (delete / remap) and the
-- ON DELETE SET NULL of a deleted disposition.
--
-- A CONCURRENTLY build that fails leaves an INVALID index behind. Find it with
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- then DROP INDEX CONCURRENTLY "<name>"; and run that statement again.

-- ── 1. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Call_dispositionId_idx"
  ON "Call" ("dispositionId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "CallAttempt_dispositionId_idx"
  ON "CallAttempt" ("dispositionId");

-- ── 2. Foreign key, unvalidated ─────────────────────────────────────────────
-- NOT VALID needs a brief ACCESS EXCLUSIVE lock and no table scan: the
-- constraint applies to new and changed rows the moment it lands. The lock
-- timeout keeps that brief moment from queueing behind a long transaction and
-- blocking every writer behind it — on a timeout, retry.

SET lock_timeout = '3s';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Call_dispositionId_fkey' AND conrelid = '"Call"'::regclass) THEN
    ALTER TABLE "Call" ADD CONSTRAINT "Call_dispositionId_fkey"
      FOREIGN KEY ("dispositionId") REFERENCES "Disposition"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

RESET lock_timeout;

-- ── 3. Validation ───────────────────────────────────────────────────────────
-- SHARE UPDATE EXCLUSIVE: reads and writes carry on while the scan runs. The
-- column is still NULL on every existing row, so every row passes — this is a
-- full scan, not a rewrite. Run it off-peak.

ALTER TABLE "Call" VALIDATE CONSTRAINT "Call_dispositionId_fkey";

-- ── 4. Check ────────────────────────────────────────────────────────────────
-- Two valid indexes, one validated constraint.
--
--   SELECT indexrelid::regclass AS index, indisvalid
--     FROM pg_index
--    WHERE indexrelid::regclass::text IN (
--            '"Call_dispositionId_idx"', '"CallAttempt_dispositionId_idx"');
--
--   SELECT conname, convalidated
--     FROM pg_constraint
--    WHERE conrelid = '"Call"'::regclass
--      AND conname = 'Call_dispositionId_fkey';
