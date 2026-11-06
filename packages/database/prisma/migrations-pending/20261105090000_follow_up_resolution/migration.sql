-- Stage 3: apply before API/worker deployment. PostgreSQL 12+.
-- Existing-table indexes and FK validation run separately with autocommit
-- from pending-migrations/20261105090100_follow_up_resolution_indexes.sql.

ALTER TYPE "MeetingEmailKind" ADD VALUE 'booked';
ALTER TYPE "MeetingEmailKind" ADD VALUE 'replaced';
ALTER TYPE "MeetingEmailKind" ADD VALUE 'cancelled';
ALTER TYPE "MeetingEmailKind" ADD VALUE 'declined_without_rescheduling';
ALTER TYPE "MeetingEmailKind" ADD VALUE 'recovery_callback';

-- AlterTable
ALTER TABLE "ContactNote" ADD COLUMN     "actorType" TEXT NOT NULL DEFAULT 'human',
ADD COLUMN     "agentId" UUID,
ADD COLUMN     "automationActionId" UUID;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "replacesMeetingId" UUID;

-- AlterTable
ALTER TABLE "PendingActionFollowUp" ALTER COLUMN "maxRecoveries" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "MeetingReminderExecution" ADD COLUMN     "dispatchCommittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MeetingEmailDelivery" ADD COLUMN     "actionId" UUID,
ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'legacy';

-- CreateTable
CREATE TABLE "MeetingAutomationAction" (
    "id" UUID NOT NULL,
    "actionKey" TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "callId" UUID,
    "agentCallId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "handoffId" UUID,
    "followUpId" UUID,
    "callbackId" UUID,
    "kind" TEXT NOT NULL,
    "scheduleVersion" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "previousScheduledAt" TIMESTAMP(3),
    "language" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "maintenanceReviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maintenanceCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAutomationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAutomationAction_actionKey_key" ON "MeetingAutomationAction"("actionKey");

-- CreateIndex
CREATE INDEX "MeetingAutomationAction_meetingId_idx" ON "MeetingAutomationAction"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingAutomationAction_callId_idx" ON "MeetingAutomationAction"("callId");

-- CreateIndex
CREATE INDEX "MeetingAutomationAction_organizationId_createdAt_idx" ON "MeetingAutomationAction"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "MeetingAutomationAction_maintenanceCompletedAt_maintenanceR_idx" ON "MeetingAutomationAction"("maintenanceCompletedAt", "maintenanceReviewAt");

-- AddForeignKey
ALTER TABLE "MeetingEmailDelivery" ADD CONSTRAINT "MeetingEmailDelivery_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "MeetingAutomationAction"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "MeetingAutomationAction" ADD CONSTRAINT "MeetingAutomationAction_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAutomationAction" ADD CONSTRAINT "MeetingAutomationAction_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
