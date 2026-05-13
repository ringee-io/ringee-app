-- CallbackTask: freelancer support
-- Decouples callbacks from campaigns so they can be created from any contact/call,
-- in either freelancer (organizationId NULL) or organization context.

-- 1. New columns (nullable for backfill)
ALTER TABLE "CallbackTask"
  ADD COLUMN "userId"         UUID,
  ADD COLUMN "organizationId" UUID,
  ADD COLUMN "contactId"      UUID,
  ADD COLUMN "callId"         UUID;

-- 2. Backfill: userId = agentUserId; contactId/organizationId from CampaignLead -> Campaign
UPDATE "CallbackTask" SET "userId" = "agentUserId";

UPDATE "CallbackTask" cb
SET "contactId"      = cl."contactId",
    "organizationId" = c."organizationId"
FROM "CampaignLead" cl
JOIN "Campaign" c ON c."id" = cl."campaignId"
WHERE cb."campaignLeadId" = cl."id";

-- 3. Enforce NOT NULL on userId / contactId (every legacy row must have been backfilled)
ALTER TABLE "CallbackTask"
  ALTER COLUMN "userId"    SET NOT NULL,
  ALTER COLUMN "contactId" SET NOT NULL;

-- 4. campaignLeadId becomes nullable for standalone callbacks
ALTER TABLE "CallbackTask"
  ALTER COLUMN "campaignLeadId" DROP NOT NULL;

-- 5. Drop legacy column
ALTER TABLE "CallbackTask" DROP COLUMN "agentUserId";

-- 6. New FK constraints
ALTER TABLE "CallbackTask"
  ADD CONSTRAINT "CallbackTask_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "CallbackTask_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "CallbackTask_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "CallbackTask_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL;

-- 7. Indexes
DROP INDEX IF EXISTS "CallbackTask_agentUserId_idx";
CREATE INDEX "CallbackTask_userId_idx"         ON "CallbackTask"("userId");
CREATE INDEX "CallbackTask_organizationId_idx" ON "CallbackTask"("organizationId");
CREATE INDEX "CallbackTask_contactId_idx"      ON "CallbackTask"("contactId");
CREATE INDEX "CallbackTask_callId_idx"         ON "CallbackTask"("callId");
