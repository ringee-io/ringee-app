-- Stage 4B/4C: the shared automatic follow-up activation (one reviewed and
-- explicitly adopted configuration per workspace and onboarding version), the
-- explicit coverage scope of reminder policies adopted through it, and the
-- backend product-analytics outbox. Apply after
-- 20261107120000_personal_voice_agent_scope and its index script, and before
-- deploying the API/workers/frontend that read these tables.
-- Transactional and additive. PostgreSQL 12+.
--
-- No backfill and no data rewrite:
-- - Existing reminder policies keep `coversMeetingsFrom` NULL, which is their
--   current meaning (every upcoming meeting on the calendar). Only a policy a
--   workspace adopts through the new review with "new bookings only" sets it.
-- - No workspace is adopted by this migration; nothing is dialed because of it.
-- - The analytics tables start empty. Nothing is sent until POSTHOG_* is set.
--
-- The new tables are created empty, so their indexes are built here, inside
-- the transaction; there is no companion CONCURRENTLY script.
--
-- Rollback: the new columns and tables are unused by older code, which keeps
-- working with them in place. Dropping them discards adoptions, opt-outs and
-- undelivered analytics facts; close follow-up admission first (FOLLOW_UP.md,
-- "Stage 4B/4C").

-- CreateEnum
CREATE TYPE "ProductAnalyticsDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "FollowUpActivationStatus" AS ENUM ('configured', 'adopted');

-- AlterTable: a nullable column and a constant default are metadata-only on
-- PostgreSQL 11+, so this takes no table rewrite.
ALTER TABLE "MeetingReminderPolicy" ADD COLUMN     "coversMeetingsFrom" TIMESTAMP(3),
ADD COLUMN     "includedMeetingIds" UUID[] DEFAULT ARRAY[]::UUID[];

-- CreateTable
CREATE TABLE "ProductAnalyticsEvent" (
    "id" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "distinctId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "properties" JSONB NOT NULL,
    "workspaceKey" TEXT,
    "status" "ProductAnalyticsDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "claimToken" UUID,
    "claimedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAnalyticsCursor" (
    "source" TEXT NOT NULL,
    "cursorAt" TIMESTAMP(3) NOT NULL,
    "cursorId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAnalyticsCursor_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "FollowUpActivation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "workspaceKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "FollowUpActivationStatus" NOT NULL DEFAULT 'configured',
    "configuration" JSONB NOT NULL,
    "scope" JSONB,
    "optOuts" JSONB,
    "entrySource" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "configuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "configuredByUserId" UUID NOT NULL,
    "adoptedAt" TIMESTAMP(3),
    "adoptedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpActivation_pkey" PRIMARY KEY ("id"),
    -- The key is derived from the ownership columns, never chosen freely: an
    -- organization's row is keyed by the organization, a personal row by its
    -- owner (WRK-001), so the two key spaces cannot collide.
    CONSTRAINT "FollowUpActivation_workspace_key_check" CHECK (
        ("organizationId" IS NOT NULL
            AND "workspaceKey" = 'organization:' || "organizationId"::text)
        OR ("organizationId" IS NULL
            AND "workspaceKey" = 'personal:' || "userId"::text)
    ),
    -- Adopted means an adopter and a time were recorded.
    CONSTRAINT "FollowUpActivation_adopted_check" CHECK (
        "status" <> 'adopted'
        OR ("adoptedAt" IS NOT NULL AND "adoptedByUserId" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductAnalyticsEvent_eventKey_key" ON "ProductAnalyticsEvent"("eventKey");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_status_nextAttemptAt_idx" ON "ProductAnalyticsEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_createdAt_idx" ON "ProductAnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "FollowUpActivation_organizationId_idx" ON "FollowUpActivation"("organizationId");

-- CreateIndex
CREATE INDEX "FollowUpActivation_userId_idx" ON "FollowUpActivation"("userId");

-- CreateIndex
CREATE INDEX "FollowUpActivation_adoptedAt_idx" ON "FollowUpActivation"("adoptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpActivation_workspaceKey_version_key" ON "FollowUpActivation"("workspaceKey", "version");

-- AddForeignKey
ALTER TABLE "FollowUpActivation" ADD CONSTRAINT "FollowUpActivation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpActivation" ADD CONSTRAINT "FollowUpActivation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
