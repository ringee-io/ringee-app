-- Stage 4A: AI Voice Agents in personal (freelancer) workspaces (AGENT-011,
-- AGENT-018). Apply after 20261105090000_follow_up_resolution and its index
-- script, and before deploying the API/workers that write personal rows.
-- Transactional and additive. PostgreSQL 12+.
--
-- A personal workspace is `userId` + `organizationId IS NULL` (WRK-001). Seven
-- automation tables required an organization; they now accept a personal row,
-- whose owner is the existing `userId` column. Participations had no owner
-- column, so they get one, and a check requires an organization or an owner.
--
-- No backfill: every existing row keeps its organization, and no personal row
-- exists until a personal workspace is admitted through
-- AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS. Keep that list empty until the
-- companion script below has run and every API/worker instance is compatible
-- (FOLLOW_UP.md, "Stage 4A deployment").
--
-- Then RUN BY HAND, with psql and autocommit (no transaction):
--   pending-migrations/20261107120100_personal_voice_agent_scope_indexes.sql
-- It builds the personal uniqueness of rail automations CONCURRENTLY and
-- validates the participation check.
--
-- Rollback: dropping NOT NULL is reversible only while no personal row exists.
-- Once one does, `SET NOT NULL` fails; close admission first and see the
-- runbook before restoring an older worker.

ALTER TABLE "AiVoiceAgentAutomation" ALTER COLUMN "organizationId" DROP NOT NULL;

ALTER TABLE "MeetingReminderPolicy" ALTER COLUMN "organizationId" DROP NOT NULL;

ALTER TABLE "MeetingReminderExecution" ALTER COLUMN "organizationId" DROP NOT NULL;

ALTER TABLE "MeetingEmailDelivery" ALTER COLUMN "organizationId" DROP NOT NULL;

ALTER TABLE "MeetingAutomationAction" ALTER COLUMN "organizationId" DROP NOT NULL;

ALTER TABLE "AiVoiceAgentHandoff" ALTER COLUMN "organizationId" DROP NOT NULL;

ALTER TABLE "AiVoiceAgentCallParticipant" ALTER COLUMN "organizationId" DROP NOT NULL,
ADD COLUMN "userId" UUID;

-- NOT VALID still applies to every new and updated row; existing rows all
-- carry an organization and are validated by the companion script.
ALTER TABLE "AiVoiceAgentCallParticipant"
  ADD CONSTRAINT "AiVoiceAgentCallParticipant_workspace_check"
  CHECK ("organizationId" IS NOT NULL OR "userId" IS NOT NULL) NOT VALID;
