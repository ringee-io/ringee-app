-- Reminders: scheduled notifications for callbacks, meetings, and follow-ups.
-- Source of truth lives in this table; the worker polls pending rows whose
-- fireAt has elapsed and dispatches them through the configured channels.

-- CreateEnum
CREATE TYPE "ReminderSubjectType" AS ENUM ('callback', 'meeting', 'followup');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('pending', 'sent', 'failed', 'cancelled', 'snoozed');

-- CreateTable
CREATE TABLE "Reminder" (
    "id"             UUID                  NOT NULL,
    "userId"         UUID                  NOT NULL,
    "organizationId" UUID,
    "subjectType"    "ReminderSubjectType" NOT NULL,
    "subjectId"      UUID                  NOT NULL,
    "fireAt"         TIMESTAMP(3)          NOT NULL,
    "channels"       TEXT[]                NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status"         "ReminderStatus"      NOT NULL DEFAULT 'pending',
    "attemptCount"   INTEGER               NOT NULL DEFAULT 0,
    "lastError"      TEXT,
    "sentAt"         TIMESTAMP(3),
    "snoozedUntil"   TIMESTAMP(3),
    "dedupeKey"      TEXT                  NOT NULL,
    "createdAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)          NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "Reminder_dedupeKey_key"          ON "Reminder"("dedupeKey");
CREATE INDEX        "Reminder_status_fireAt_idx"      ON "Reminder"("status", "fireAt");
CREATE INDEX        "Reminder_userId_idx"             ON "Reminder"("userId");
CREATE INDEX        "Reminder_organizationId_idx"     ON "Reminder"("organizationId");
CREATE INDEX        "Reminder_subjectType_subjectId_idx" ON "Reminder"("subjectType", "subjectId");

-- FKs
ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "Reminder_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL;
