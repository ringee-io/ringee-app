-- Additive Stage 2. Deploy with the Stage 0/1 pending-migration workflow.
-- No historical outcome is enrolled and no index is built on Call.
ALTER TYPE "CallbackAgentKind" ADD VALUE IF NOT EXISTS 'policy';
ALTER TABLE "Call" ADD COLUMN "outcomeRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outcomeCommitment" JSONB;
ALTER TABLE "CallbackTask" ADD COLUMN "sourceRevision" INTEGER;
ALTER TABLE "PendingActionFollowUp" ADD COLUMN "automationId" UUID,
  ADD COLUMN "calendarId" UUID, ADD COLUMN "commitment" JSONB;
