-- AI voice agent automations: the "Ringee IA Voice Agents" rail (quick
-- actions), meeting reminder calls with explicit attendance confirmation, and
-- the shared confirmation email. See AGENT-017..AGENT-020 and CAL-003.
--
-- Additive only: new enums, new tables, and nullable or defaulted columns on
-- Meeting, AiVoiceAgentCall and InboundRoute. Existing rows read exactly as
-- before (attendance "pending", schedule/route version 1, no responsible member
-- — which falls back to whoever created the meeting).

-- CreateEnum
CREATE TYPE "MeetingAttendanceStatus" AS ENUM ('pending', 'confirmed', 'declined');

-- CreateEnum
CREATE TYPE "MeetingReminderExecutionStatus" AS ENUM ('scheduled', 'claimed', 'placed', 'confirmed', 'declined', 'no_answer', 'completed', 'skipped', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "MeetingEmailKind" AS ENUM ('attendance_confirmed', 'attendance_declined');

-- CreateEnum
CREATE TYPE "MeetingEmailDeliveryStatus" AS ENUM ('pending', 'sending', 'sent', 'needs_email', 'needs_member', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "attendanceAgentCallId" UUID,
ADD COLUMN     "attendanceNote" TEXT,
ADD COLUMN     "attendanceScheduleVersion" INTEGER,
ADD COLUMN     "attendanceStatus" "MeetingAttendanceStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "attendanceUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "leadEmail" TEXT,
ADD COLUMN     "responsibleUserId" UUID,
ADD COLUMN     "scheduleVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "AiVoiceAgentCall" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "responsibleUserId" UUID;

-- AlterTable
ALTER TABLE "InboundRoute" ADD COLUMN     "restoreDestinationId" UUID,
ADD COLUMN     "restoreDestinationType" "InboundDestinationType",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "AiVoiceAgentAutomation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "capability" "AiVoiceAgentType" NOT NULL,
    "contextKey" TEXT NOT NULL DEFAULT 'workspace',
    "agentId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "claimToken" UUID,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVoiceAgentAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingReminderPolicy" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "calendarId" UUID NOT NULL,
    "offsetsMinutes" INTEGER[],
    "windowStartMinute" INTEGER NOT NULL DEFAULT 540,
    "windowEndMinute" INTEGER NOT NULL DEFAULT 1200,
    "windowDays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingReminderPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingReminderExecution" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "policyId" UUID,
    "agentId" UUID NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'policy',
    "scheduleVersion" INTEGER NOT NULL,
    "policyVersion" INTEGER,
    "offsetMinutes" INTEGER,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "status" "MeetingReminderExecutionStatus" NOT NULL DEFAULT 'scheduled',
    "dialTries" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "agentCallId" UUID,
    "reason" TEXT,
    "lastError" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingReminderExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingEmailDelivery" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "kind" "MeetingEmailKind" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "MeetingEmailDeliveryStatus" NOT NULL DEFAULT 'pending',
    "toAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyTo" TEXT,
    "subject" TEXT,
    "providerEmailId" TEXT,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiVoiceAgentAutomation_agentId_idx" ON "AiVoiceAgentAutomation"("agentId");

-- CreateIndex
CREATE INDEX "AiVoiceAgentAutomation_userId_idx" ON "AiVoiceAgentAutomation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiVoiceAgentAutomation_organizationId_capability_contextKey_key" ON "AiVoiceAgentAutomation"("organizationId", "capability", "contextKey");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingReminderPolicy_calendarId_key" ON "MeetingReminderPolicy"("calendarId");

-- CreateIndex
CREATE INDEX "MeetingReminderPolicy_organizationId_idx" ON "MeetingReminderPolicy"("organizationId");

-- CreateIndex
CREATE INDEX "MeetingReminderPolicy_agentId_idx" ON "MeetingReminderPolicy"("agentId");

-- CreateIndex
CREATE INDEX "MeetingReminderPolicy_userId_idx" ON "MeetingReminderPolicy"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingReminderExecution_idempotencyKey_key" ON "MeetingReminderExecution"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingReminderExecution_agentCallId_key" ON "MeetingReminderExecution"("agentCallId");

-- CreateIndex
CREATE INDEX "MeetingReminderExecution_status_fireAt_idx" ON "MeetingReminderExecution"("status", "fireAt");

-- CreateIndex
CREATE INDEX "MeetingReminderExecution_meetingId_status_idx" ON "MeetingReminderExecution"("meetingId", "status");

-- CreateIndex
CREATE INDEX "MeetingReminderExecution_policyId_status_idx" ON "MeetingReminderExecution"("policyId", "status");

-- CreateIndex
CREATE INDEX "MeetingReminderExecution_organizationId_updatedAt_idx" ON "MeetingReminderExecution"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "MeetingReminderExecution_agentId_idx" ON "MeetingReminderExecution"("agentId");

-- CreateIndex
CREATE INDEX "MeetingReminderExecution_userId_idx" ON "MeetingReminderExecution"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingEmailDelivery_idempotencyKey_key" ON "MeetingEmailDelivery"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MeetingEmailDelivery_status_updatedAt_idx" ON "MeetingEmailDelivery"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "MeetingEmailDelivery_meetingId_idx" ON "MeetingEmailDelivery"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingEmailDelivery_organizationId_updatedAt_idx" ON "MeetingEmailDelivery"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "MeetingEmailDelivery_userId_idx" ON "MeetingEmailDelivery"("userId");

-- CreateIndex
CREATE INDEX "Meeting_responsibleUserId_idx" ON "Meeting"("responsibleUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AiVoiceAgentCall_idempotencyKey_key" ON "AiVoiceAgentCall"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AiVoiceAgentCall_responsibleUserId_idx" ON "AiVoiceAgentCall"("responsibleUserId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentCall" ADD CONSTRAINT "AiVoiceAgentCall_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentAutomation" ADD CONSTRAINT "AiVoiceAgentAutomation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentAutomation" ADD CONSTRAINT "AiVoiceAgentAutomation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVoiceAgentAutomation" ADD CONSTRAINT "AiVoiceAgentAutomation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiVoiceAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReminderPolicy" ADD CONSTRAINT "MeetingReminderPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReminderPolicy" ADD CONSTRAINT "MeetingReminderPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReminderPolicy" ADD CONSTRAINT "MeetingReminderPolicy_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiVoiceAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReminderPolicy" ADD CONSTRAINT "MeetingReminderPolicy_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReminderExecution" ADD CONSTRAINT "MeetingReminderExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReminderExecution" ADD CONSTRAINT "MeetingReminderExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReminderExecution" ADD CONSTRAINT "MeetingReminderExecution_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReminderExecution" ADD CONSTRAINT "MeetingReminderExecution_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "MeetingReminderPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReminderExecution" ADD CONSTRAINT "MeetingReminderExecution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiVoiceAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReminderExecution" ADD CONSTRAINT "MeetingReminderExecution_agentCallId_fkey" FOREIGN KEY ("agentCallId") REFERENCES "AiVoiceAgentCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingEmailDelivery" ADD CONSTRAINT "MeetingEmailDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingEmailDelivery" ADD CONSTRAINT "MeetingEmailDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingEmailDelivery" ADD CONSTRAINT "MeetingEmailDelivery_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

