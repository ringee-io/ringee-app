-- Reuses AiVoiceAgent and AiVoiceAgentCall. No Receptionist model.
ALTER TYPE "InboundDestinationType" ADD VALUE IF NOT EXISTS 'extension';

ALTER TABLE "OrganizationMembership" ADD COLUMN "extension" TEXT;
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_extension_key"
  ON "OrganizationMembership" ("organizationId", "extension");

ALTER TABLE "Call"
  ADD COLUMN "answeredByRingAttemptId" UUID,
  ADD COLUMN "inboundTransferDestinationType" "InboundDestinationType",
  ADD COLUMN "inboundTransferDestinationId" UUID,
  ADD COLUMN "inboundTransferState" TEXT,
  ADD COLUMN "inboundTransferRequestedAt" TIMESTAMP(3);

ALTER TABLE "InboundRingAttempt"
  ADD COLUMN "endpointKey" TEXT,
  ADD COLUMN "providerCallControlId" TEXT,
  ADD COLUMN "providerCallLegId" TEXT,
  ADD COLUMN "chargedCredits" DOUBLE PRECISION;
UPDATE "InboundRingAttempt" SET "endpointKey" =
  CASE WHEN "sipDeviceId" IS NOT NULL THEN 'desk:' || "sipDeviceId"::text
       WHEN "userId" IS NOT NULL THEN 'user:' || "userId"::text
       ELSE 'legacy:' || "id"::text END;
ALTER TABLE "InboundRingAttempt" ALTER COLUMN "endpointKey" SET NOT NULL;
DROP INDEX "InboundRingAttempt_callId_userId_key";
CREATE UNIQUE INDEX "InboundRingAttempt_callId_endpointKey_key"
  ON "InboundRingAttempt" ("callId", "endpointKey");
CREATE UNIQUE INDEX "InboundRingAttempt_providerCallControlId_key"
  ON "InboundRingAttempt" ("providerCallControlId");

ALTER TABLE "InboundRingAttempt"
  ADD COLUMN "recipientConnectionId" TEXT,
  ADD COLUMN "recipientCallControlId" TEXT,
  ADD COLUMN "providerCallSessionId" TEXT,
  ADD COLUMN "recipientCallSessionId" TEXT;
CREATE UNIQUE INDEX "InboundRingAttempt_recipientCallControlId_key" ON "InboundRingAttempt"("recipientCallControlId");
CREATE INDEX "InboundRingAttempt_providerCallSessionId_idx" ON "InboundRingAttempt"("providerCallSessionId");
CREATE INDEX "InboundRingAttempt_recipientCallSessionId_idx" ON "InboundRingAttempt"("recipientCallSessionId");
