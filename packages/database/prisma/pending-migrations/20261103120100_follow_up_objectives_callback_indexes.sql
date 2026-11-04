-- Callback index and foreign-key validation for 20261103120000_follow_up_objectives.
--
-- Apply the schema migration first. Then RUN BY HAND with psql, one statement
-- at a time, with autocommit enabled: no BEGIN, --single-transaction or Prisma
-- migration runner. CREATE INDEX CONCURRENTLY cannot run in a transaction.
-- Run it before the follow-up pilot is enabled: until the index is valid,
-- reading an objective's callbacks and the SET NULL on an objective's deletion
-- scan CallbackTask.
--
-- A plain index build blocks writes to the live CallbackTask table, and so
-- would validating the foreign key inside the migration. The migration adds
-- "CallbackTask_followUpId_fkey" NOT VALID: it already applies to new and
-- changed rows and to its ON DELETE SET NULL / ON UPDATE CASCADE actions.
--
-- A CONCURRENTLY build that fails leaves an INVALID index behind. Find it with
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- then DROP INDEX CONCURRENTLY "<name>"; and run that statement again.

-- ── 1. Index ────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS "CallbackTask_followUpId_idx"
  ON "CallbackTask" ("followUpId");

-- ── 2. Validation, once the index above is valid ────────────────────────────
-- SHARE UPDATE EXCLUSIVE: reads and writes carry on while the scan runs. Rows
-- written before the migration have a NULL followUpId and pass — this is a full
-- scan, not a rewrite. Run it off-peak.

ALTER TABLE "CallbackTask" VALIDATE CONSTRAINT "CallbackTask_followUpId_fkey";

-- ── 3. Check ────────────────────────────────────────────────────────────────
-- One valid index, one validated constraint.
--
--   SELECT indexrelid::regclass AS index, indisvalid
--     FROM pg_index
--    WHERE indexrelid::regclass::text = '"CallbackTask_followUpId_idx"';
--
--   SELECT conname, convalidated
--     FROM pg_constraint
--    WHERE conrelid = '"CallbackTask"'::regclass
--      AND conname = 'CallbackTask_followUpId_fkey';
