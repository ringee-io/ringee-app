-- Callback index for 20261103120000_follow_up_objectives.
--
-- Apply the schema migration first. Then RUN BY HAND with psql, with
-- autocommit enabled: no BEGIN, --single-transaction or Prisma migration
-- runner. CREATE INDEX CONCURRENTLY cannot run in a transaction.
-- Build it before the follow-up pilot is enabled: until it is valid, reading
-- an objective's callbacks and the SET NULL on an objective's deletion scan
-- CallbackTask.
--
-- A plain index build blocks writes to the live CallbackTask table.
-- If the concurrent build fails, check pg_index.indisvalid, drop the invalid
-- index with DROP INDEX CONCURRENTLY, and retry the statement.

CREATE INDEX CONCURRENTLY "CallbackTask_followUpId_idx"
  ON "CallbackTask" ("followUpId");
