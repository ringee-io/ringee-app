-- Additive: two new tables, three new enums, and nullable columns on
-- CallbackTask. Nothing reads them until the new backend and orchestrator run.
-- After this migration, run the companion pending-migrations/
-- 20261103120100_follow_up_objectives_callback_indexes.sql manually with psql:
-- a plain index build on the live CallbackTask table would block its writes.
-- The CallbackTask foreign key lands here NOT VALID: no table scan, only a
-- brief lock, and it already applies to new rows. That file validates it.

-- CreateEnum
CREATE TYPE "FollowUpState" AS ENUM ('scheduled', 'in_progress', 'waiting', 'recovering', 'paused', 'blocked', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "FollowUpExecutionMode" AS ENUM ('automatic', 'manual');

-- CreateEnum
CREATE TYPE "FollowUpClosureReason" AS ENUM ('refusal', 'cancelled', 'expired', 'attempts_exhausted');

-- AlterTable
ALTER TABLE "CallbackTask" ADD COLUMN     "dispatchCommittedAt" TIMESTAMP(3),
ADD COLUMN     "followUpId" UUID,
ADD COLUMN     "objectiveAttempt" INTEGER;

-- CreateTable
CREATE TABLE "PendingActionFollowUp" (
    "id" UUID NOT NULL,
    "pendingActionId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "objectiveType" TEXT NOT NULL,
    "desiredResult" TEXT NOT NULL,
    "configuredByUserId" UUID NOT NULL,
    "responsibleUserId" UUID NOT NULL,
    "agentId" UUID,
    "meetingId" UUID,
    "meetingScheduledAt" TIMESTAMP(3),
    "handoffId" UUID,
    "mode" "FollowUpExecutionMode" NOT NULL DEFAULT 'automatic',
    "state" "FollowUpState" NOT NULL DEFAULT 'waiting',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "timingBasis" TEXT NOT NULL DEFAULT 'none',
    "reason" TEXT,
    "activeCallbackId" UUID,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "recoveryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRecoveries" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolutionEvidence" JSONB,
    "closureReason" "FollowUpClosureReason",
    "closureEvidence" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingActionFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingActionFollowUpEvent" (
    "id" UUID NOT NULL,
    "followUpId" UUID NOT NULL,
    "actionKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "evidence" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingActionFollowUpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingActionFollowUp_pendingActionId_key" ON "PendingActionFollowUp"("pendingActionId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingActionFollowUp_sourceKey_key" ON "PendingActionFollowUp"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "PendingActionFollowUp_handoffId_key" ON "PendingActionFollowUp"("handoffId");

-- CreateIndex
CREATE INDEX "PendingActionFollowUp_state_reviewAt_idx" ON "PendingActionFollowUp"("state", "reviewAt");

-- CreateIndex
CREATE INDEX "PendingActionFollowUp_responsibleUserId_idx" ON "PendingActionFollowUp"("responsibleUserId");

-- CreateIndex
CREATE INDEX "PendingActionFollowUp_meetingId_idx" ON "PendingActionFollowUp"("meetingId");

-- CreateIndex
CREATE INDEX "PendingActionFollowUpEvent_followUpId_occurredAt_idx" ON "PendingActionFollowUpEvent"("followUpId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingActionFollowUpEvent_followUpId_actionKey_key" ON "PendingActionFollowUpEvent"("followUpId", "actionKey");

-- AddForeignKey
ALTER TABLE "CallbackTask" ADD CONSTRAINT "CallbackTask_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "PendingActionFollowUp"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "PendingActionFollowUp" ADD CONSTRAINT "PendingActionFollowUp_pendingActionId_fkey" FOREIGN KEY ("pendingActionId") REFERENCES "PendingAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingActionFollowUp" ADD CONSTRAINT "PendingActionFollowUp_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "AiVoiceAgentHandoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingActionFollowUpEvent" ADD CONSTRAINT "PendingActionFollowUpEvent_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "PendingActionFollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Durable lifecycle invariants: an active objective is never silently orphaned.
ALTER TABLE "PendingActionFollowUp"
  ADD CONSTRAINT "PendingActionFollowUp_next_step_check" CHECK (
    "state" IN ('resolved', 'closed') OR
    ("nextAction" IS NOT NULL AND "nextActionAt" IS NOT NULL) OR
    "activeCallbackId" IS NOT NULL OR
    ("state" IN ('waiting', 'paused', 'blocked') AND "reason" IS NOT NULL AND length("reason") > 0)
  ),
  ADD CONSTRAINT "PendingActionFollowUp_resolution_check" CHECK (
    "state" <> 'resolved' OR ("resolvedAt" IS NOT NULL AND "resolutionEvidence" IS NOT NULL)
  ),
  ADD CONSTRAINT "PendingActionFollowUp_closure_check" CHECK (
    "state" <> 'closed' OR ("closedAt" IS NOT NULL AND "closureReason" IS NOT NULL AND "closureEvidence" IS NOT NULL)
  ),
  ADD CONSTRAINT "PendingActionFollowUp_limits_check" CHECK (
    "attemptCount" >= 0 AND "recoveryCount" >= 0 AND
    "maxAttempts" > 0 AND "maxRecoveries" >= 0 AND "revision" > 0
  );
