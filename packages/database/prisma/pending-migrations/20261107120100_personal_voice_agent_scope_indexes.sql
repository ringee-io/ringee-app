-- Companion of migrations-pending/20261107120000_personal_voice_agent_scope.
--
-- Apply the schema migration first. Then RUN BY HAND with psql, one statement
-- at a time, with autocommit enabled: no BEGIN, --single-transaction or Prisma
-- migration runner. CREATE INDEX CONCURRENTLY cannot run in a transaction.
-- Run it before any personal workspace is admitted
-- (AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS stays empty until it is done).
--
-- A CONCURRENTLY build that fails leaves an INVALID index behind. Find it with
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- then DROP INDEX CONCURRENTLY "<name>"; and run that statement again.

-- ── 1. One rail automation per personal workspace and capability ───────────
-- The table's unique key covers organizations only: PostgreSQL treats the null
-- organization of every personal row as distinct. A personal row is keyed by
-- its owner. No personal row exists before admission, so the build cannot meet
-- a duplicate. The repository also serializes setup under the workspace lock;
-- this index is the backstop, and its name carries "capability" because the
-- claim recognizes that conflict by it.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "AiVoiceAgentAutomation_personal_capability_contextKey_key"
  ON "AiVoiceAgentAutomation" ("userId", "capability", "contextKey")
  WHERE "organizationId" IS NULL;

-- ── 2. Validation of the participation owner check ──────────────────────────
-- SHARE UPDATE EXCLUSIVE: reads and writes carry on while the scan runs. Every
-- row written before the migration carries an organization and passes.

ALTER TABLE "AiVoiceAgentCallParticipant"
  VALIDATE CONSTRAINT "AiVoiceAgentCallParticipant_workspace_check";

-- ── 3. Check ────────────────────────────────────────────────────────────────
--
--   SELECT indexrelid::regclass AS index, indisvalid
--     FROM pg_index
--    WHERE indexrelid::regclass::text =
--          '"AiVoiceAgentAutomation_personal_capability_contextKey_key"';
--
--   SELECT conname, convalidated
--     FROM pg_constraint
--    WHERE conrelid = '"AiVoiceAgentCallParticipant"'::regclass
--      AND conname = 'AiVoiceAgentCallParticipant_workspace_check';
