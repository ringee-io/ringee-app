-- AI voice agent handoffs (AGENT-021): one agent continuing another's call,
-- and the callbacks the scheduling agent places for a handoff request.
-- Additive: two new tables, six new enums, and nullable or defaulted columns on
-- CallbackTask. Nothing reads them until the new backend and orchestrator run.
-- After this migration, run the companion pending-migrations/
-- 20261102120100_voice_agent_handoffs_callback_indexes.sql manually with psql,
-- one statement at a time, before enabling the callback idempotency path.

-- CreateEnum
CREATE TYPE "CallbackAgentKind" AS ENUM ('agreed', 'recovery');

-- CreateEnum
CREATE TYPE "AiVoiceAgentHandoffPurpose" AS ENUM ('reschedule_meeting');

-- CreateEnum
CREATE TYPE "AiVoiceAgentHandoffStatus" AS ENUM ('prepared', 'completed', 'failed', 'uncertain');

-- CreateEnum
CREATE TYPE "AiVoiceAgentHandoffRequestStatus" AS ENUM ('pending', 'needs_attention', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "AiVoiceAgentParticipantRole" AS ENUM ('initial', 'handoff', 'callback');

-- CreateEnum
CREATE TYPE "AiVoiceAgentParticipantStatus" AS ENUM ('active', 'handed_off', 'ended');

-- AlterTable
ALTER TABLE "CallbackTask" ADD COLUMN     "agentCallId" UUID,
ADD COLUMN     "agentCallbackKey" TEXT,
ADD COLUMN     "agentCallbackKind" "CallbackAgentKind",
ADD COLUMN     "agentId" UUID,
ADD COLUMN     "claimToken" UUID,
ADD COLUMN     "dialReservedAt" TIMESTAMP(3),
ADD COLUMN     "dialTries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "handoffId" UUID,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "notBefore" TIMESTAMP(3),
ADD COLUMN     "reason" TEXT;

-- CreateTable
CREATE TABLE "AiVoiceAgentHandoff" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "purpose" "AiVoiceAgentHandoffPurpose" NOT NULL,
    "agentCallId" UUID NOT NULL,
    "callId" UUID,
    "contactId" UUID,
    "sourceAgentId" UUID NOT NULL,
    "destinationAgentId" UUID,
    "automationId" UUID,
    "meetingId" UUID NOT NULL,
    "meetingScheduleVersion" INTEGER NOT NULL,
    "meetingScheduledAt" TIMESTAMP(3) NOT NULL,
    "reminderExecutionId" UUID,
    "calendarId" UUID,
    "responsibleUserId" UUID,
    "reason" TEXT NOT NULL,
    "reasonNote" TEXT,
    "preferences" TEXT,
    "language" TEXT NOT NULL,
    "languageSource" TEXT NOT NULL,
    "context" JSONB,
    "status" "AiVoiceAgentHandoffStatus" NOT NULL DEFAULT 'prepared',
    "failureReason" TEXT,
    "lastError" TEXT,
    "requestStatus" "AiVoiceAgentHandoffRequestStatus" NOT NULL DEFAULT 'pending',
    "resolution" TEXT,
    "offeredSlots" JSONB,
    "offeredAt" TIMESTAMP(3),
    "offeredAgentCallId" UUID,
    "recoveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "reviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVoiceAgentHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiVoiceAgentCallParticipant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "agentCallId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "role" "AiVoiceAgentParticipantRole" NOT NULL,
    "status" "AiVoiceAgentParticipantStatus" NOT NULL DEFAULT 'active',
    "sequence" INTEGER NOT NULL,
    "meetingId" UUID,
    "meetingScheduleVersion" INTEGER,
    "calendarId" UUID,
    "providerConversationId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVoiceAgentCallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiVoiceAgentHandoff_idempotencyKey_key" ON "AiVoiceAgentHandoff"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AiVoiceAgentHandoff_requestStatus_reviewAt_idx" ON "AiVoiceAgentHandoff"("requestStatus", "reviewAt");

-- CreateIndex
CREATE INDEX "AiVoiceAgentHandoff_agentCallId_idx" ON "AiVoiceAgentHandoff"("agentCallId");

-- CreateIndex
CREATE INDEX "AiVoiceAgentHandoff_meetingId_idx" ON "AiVoiceAgentHandoff"("meetingId");

-- CreateIndex
CREATE INDEX "AiVoiceAgentHandoff_contactId_idx" ON "AiVoiceAgentHandoff"("contactId");

-- CreateIndex
CREATE INDEX "AiVoiceAgentHandoff_organizationId_createdAt_idx" ON "AiVoiceAgentHandoff"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiVoiceAgentHandoff_sourceAgentId_idx" ON "AiVoiceAgentHandoff"("sourceAgentId");

-- CreateIndex
CREATE INDEX "AiVoiceAgentHandoff_destinationAgentId_idx" ON "AiVoiceAgentHandoff"("destinationAgentId");

-- CreateIndex
CREATE INDEX "AiVoiceAgentHandoff_userId_idx" ON "AiVoiceAgentHandoff"("userId");

-- CreateIndex
CREATE INDEX "AiVoiceAgentCallParticipant_handoffId_idx" ON "AiVoiceAgentCallParticipant"("handoffId");

-- CreateIndex
CREATE INDEX "AiVoiceAgentCallParticipant_agentId_idx" ON "AiVoiceAgentCallParticipant"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AiVoiceAgentCallParticipant_agentCallId_sequence_key" ON "AiVoiceAgentCallParticipant"("agentCallId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AiVoiceAgentCallParticipant_agentCallId_agentId_key" ON "AiVoiceAgentCallParticipant"("agentCallId", "agentId");

-- AddForeignKey
ALTER TABLE "CallbackTask" ADD CONSTRAINT "CallbackTask_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiVoiceAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallbackTask" ADD CONSTRAINT "CallbackTask_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "AiVoiceAgentHandoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallbackTask" ADD CONSTRAINT "CallbackTask_agentCallId_fkey" FOREIGN KEY ("agentCallId") REFERENCES "AiVoiceAgentCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentHandoff" ADD CONSTRAINT "AiVoiceAgentHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentHandoff" ADD CONSTRAINT "AiVoiceAgentHandoff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentHandoff" ADD CONSTRAINT "AiVoiceAgentHandoff_agentCallId_fkey" FOREIGN KEY ("agentCallId") REFERENCES "AiVoiceAgentCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentHandoff" ADD CONSTRAINT "AiVoiceAgentHandoff_sourceAgentId_fkey" FOREIGN KEY ("sourceAgentId") REFERENCES "AiVoiceAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentHandoff" ADD CONSTRAINT "AiVoiceAgentHandoff_destinationAgentId_fkey" FOREIGN KEY ("destinationAgentId") REFERENCES "AiVoiceAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentHandoff" ADD CONSTRAINT "AiVoiceAgentHandoff_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentHandoff" ADD CONSTRAINT "AiVoiceAgentHandoff_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentCallParticipant" ADD CONSTRAINT "AiVoiceAgentCallParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentCallParticipant" ADD CONSTRAINT "AiVoiceAgentCallParticipant_agentCallId_fkey" FOREIGN KEY ("agentCallId") REFERENCES "AiVoiceAgentCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentCallParticipant" ADD CONSTRAINT "AiVoiceAgentCallParticipant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiVoiceAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentCallParticipant" ADD CONSTRAINT "AiVoiceAgentCallParticipant_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "AiVoiceAgentHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

