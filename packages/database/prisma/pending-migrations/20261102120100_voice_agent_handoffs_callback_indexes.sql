-- Callback indexes for 20261102120000_voice_agent_handoffs.
--
-- Apply the schema migration first. Then RUN BY HAND with psql, one statement
-- at a time, with autocommit enabled: no BEGIN, --single-transaction or Prisma
-- migration runner. CREATE INDEX CONCURRENTLY cannot run in a transaction.
-- Keep the callback idempotency path disabled until all five indexes are valid;
-- its replay protection requires the two unique indexes below.
--
-- A plain index build blocks writes to the live CallbackTask table.
-- If a concurrent build fails, check pg_index.indisvalid, drop the invalid
-- index with DROP INDEX CONCURRENTLY, and retry that statement.

CREATE UNIQUE INDEX CONCURRENTLY "CallbackTask_agentCallbackKey_key"
  ON "CallbackTask" ("agentCallbackKey");

CREATE UNIQUE INDEX CONCURRENTLY "CallbackTask_agentCallId_key"
  ON "CallbackTask" ("agentCallId");

CREATE INDEX CONCURRENTLY "CallbackTask_agentCallbackKind_status_scheduledAt_idx"
  ON "CallbackTask" ("agentCallbackKind", "status", "scheduledAt");

CREATE INDEX CONCURRENTLY "CallbackTask_handoffId_idx"
  ON "CallbackTask" ("handoffId");

CREATE INDEX CONCURRENTLY "CallbackTask_agentId_idx"
  ON "CallbackTask" ("agentId");
