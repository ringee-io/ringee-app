-- Generated migration for the Inbox module.
--
-- The migrations/ directory in this repo is owned by root (Docker created it),
-- so this SQL is parked here. To apply:
--
--   1)  sudo mkdir -p packages/database/prisma/migrations/20260502120000_inbox
--   2)  sudo cp packages/database/scripts/20260502120000_inbox.sql \
--              packages/database/prisma/migrations/20260502120000_inbox/migration.sql
--   3)  sudo chown -R "$(whoami)":staff packages/database/prisma/migrations/20260502120000_inbox
--   4)  pnpm prisma:migrate
--
-- Or, equivalently, just run `pnpm prisma:migrate` directly with the new
-- schema.prisma in place — Prisma will regenerate this same SQL into a
-- properly-named migration directory.

-- CreateEnum
CREATE TYPE "InboxThreadStatus" AS ENUM ('open', 'pending', 'resolved', 'archived', 'spam');

-- CreateEnum
CREATE TYPE "InboxEventDirection" AS ENUM ('inbound', 'outbound', 'internal', 'system');

-- CreateEnum
CREATE TYPE "InboxEventKind" AS ENUM ('call_started', 'call_answered', 'missed_call', 'call_completed', 'voicemail_received', 'voicemail_drop_sent', 'sms_received', 'sms_sent', 'mms_received', 'mms_sent', 'message_failed', 'note_added', 'callback_scheduled', 'callback_completed', 'meeting_booked', 'crm_activity', 'status_changed');

-- CreateEnum
CREATE TYPE "InboxEventStatus" AS ENUM ('pending', 'sent', 'delivered', 'failed', 'completed', 'missed', 'received');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('sms', 'mms');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('queued', 'sending', 'sent', 'delivered', 'delivery_unconfirmed', 'failed', 'received');

-- AlterTable
ALTER TABLE "UserNumber" ADD COLUMN     "canReceiveMms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canReceiveSms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSendMms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSendSms" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NumberPurchased" ADD COLUMN     "messagingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "messagingError" TEXT,
ADD COLUMN     "messagingStatus" TEXT,
ADD COLUMN     "mmsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providerMessagingProfileId" TEXT,
ADD COLUMN     "smsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Recording" ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "transcript" TEXT;

-- CreateTable
CREATE TABLE "InboxThread" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "organizationId" UUID,
    "contactId" UUID,
    "numberId" UUID,
    "participantNumber" VARCHAR(30) NOT NULL,
    "participantNumberE164" VARCHAR(20),
    "ringeeNumber" VARCHAR(30),
    "assignedToId" UUID,
    "status" "InboxThreadStatus" NOT NULL DEFAULT 'open',
    "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastPreview" TEXT,
    "lastEventKind" "InboxEventKind",
    "resolvedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxEvent" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "direction" "InboxEventDirection" NOT NULL,
    "kind" "InboxEventKind" NOT NULL,
    "status" "InboxEventStatus",
    "callId" UUID,
    "messageId" UUID,
    "recordingId" UUID,
    "voicemailDropAssetId" UUID,
    "callbackTaskId" UUID,
    "meetingId" UUID,
    "title" TEXT,
    "body" TEXT,
    "fromNumber" VARCHAR(30),
    "toNumber" VARCHAR(30),
    "audioUrl" TEXT,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "durationSec" INTEGER,
    "transcript" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" BIGSERIAL NOT NULL,
    "metadata" JSONB,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "organizationId" UUID,
    "contactId" UUID,
    "threadId" UUID,
    "numberId" UUID,
    "provider" TEXT NOT NULL DEFAULT 'telnyx',
    "providerMessageId" TEXT,
    "messagingProfileId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'sms',
    "status" "MessageStatus" NOT NULL DEFAULT 'queued',
    "fromNumber" VARCHAR(30) NOT NULL,
    "toNumber" VARCHAR(30) NOT NULL,
    "text" TEXT,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageEvent" (
    "id" UUID NOT NULL,
    "messageId" UUID,
    "provider" TEXT NOT NULL DEFAULT 'telnyx',
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxThread_userId_idx" ON "InboxThread"("userId");
CREATE INDEX "InboxThread_organizationId_idx" ON "InboxThread"("organizationId");
CREATE INDEX "InboxThread_contactId_idx" ON "InboxThread"("contactId");
CREATE INDEX "InboxThread_numberId_idx" ON "InboxThread"("numberId");
CREATE INDEX "InboxThread_participantNumberE164_idx" ON "InboxThread"("participantNumberE164");
CREATE INDEX "InboxThread_status_lastEventAt_idx" ON "InboxThread"("status", "lastEventAt");
CREATE INDEX "InboxThread_assignedToId_status_idx" ON "InboxThread"("assignedToId", "status");

CREATE INDEX "InboxEvent_threadId_occurredAt_idx" ON "InboxEvent"("threadId", "occurredAt");
CREATE INDEX "InboxEvent_threadId_sequence_idx" ON "InboxEvent"("threadId", "sequence");
CREATE INDEX "InboxEvent_callId_idx" ON "InboxEvent"("callId");
CREATE INDEX "InboxEvent_messageId_idx" ON "InboxEvent"("messageId");
CREATE INDEX "InboxEvent_recordingId_idx" ON "InboxEvent"("recordingId");
CREATE INDEX "InboxEvent_kind_idx" ON "InboxEvent"("kind");

CREATE UNIQUE INDEX "Message_providerMessageId_key" ON "Message"("providerMessageId");
CREATE UNIQUE INDEX "Message_idempotencyKey_key" ON "Message"("idempotencyKey");
CREATE INDEX "Message_userId_idx" ON "Message"("userId");
CREATE INDEX "Message_organizationId_idx" ON "Message"("organizationId");
CREATE INDEX "Message_contactId_idx" ON "Message"("contactId");
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");
CREATE INDEX "Message_numberId_idx" ON "Message"("numberId");
CREATE INDEX "Message_providerMessageId_idx" ON "Message"("providerMessageId");
CREATE INDEX "Message_fromNumber_idx" ON "Message"("fromNumber");
CREATE INDEX "Message_toNumber_idx" ON "Message"("toNumber");
CREATE INDEX "Message_status_idx" ON "Message"("status");
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

CREATE UNIQUE INDEX "MessageEvent_providerEventId_key" ON "MessageEvent"("providerEventId");
CREATE INDEX "MessageEvent_messageId_idx" ON "MessageEvent"("messageId");
CREATE INDEX "MessageEvent_eventType_idx" ON "MessageEvent"("eventType");
CREATE INDEX "MessageEvent_occurredAt_idx" ON "MessageEvent"("occurredAt");

CREATE INDEX "NumberPurchased_providerMessagingProfileId_idx" ON "NumberPurchased"("providerMessagingProfileId");

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxEvent" ADD CONSTRAINT "InboxEvent_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "InboxThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxEvent" ADD CONSTRAINT "InboxEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxEvent" ADD CONSTRAINT "InboxEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxEvent" ADD CONSTRAINT "InboxEvent_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxEvent" ADD CONSTRAINT "InboxEvent_voicemailDropAssetId_fkey" FOREIGN KEY ("voicemailDropAssetId") REFERENCES "VoicemailDropAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxEvent" ADD CONSTRAINT "InboxEvent_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "InboxThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageEvent" ADD CONSTRAINT "MessageEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
