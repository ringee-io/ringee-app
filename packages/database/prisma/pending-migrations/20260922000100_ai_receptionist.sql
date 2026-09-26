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
-- Rollout shim: instances still on the previous Prisma client insert without
-- "endpointKey". Derive it the way they deduplicated — one attempt per member —
-- so their inserts keep working and a redelivered webhook still rings nobody
-- twice. New code always sets the key. Drop the trigger and function once no
-- instance predating this migration runs.
CREATE OR REPLACE FUNCTION "InboundRingAttempt_legacy_endpointKey"()
RETURNS trigger AS $$
BEGIN
  IF NEW."endpointKey" IS NULL THEN
    NEW."endpointKey" :=
      CASE WHEN NEW."sipDeviceId" IS NOT NULL THEN 'desk:' || NEW."sipDeviceId"::text
           WHEN NEW."userId" IS NOT NULL THEN 'user:' || NEW."userId"::text
           ELSE 'legacy:' || NEW."id"::text END;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "InboundRingAttempt_legacy_endpointKey"
  BEFORE INSERT ON "InboundRingAttempt"
  FOR EACH ROW EXECUTE FUNCTION "InboundRingAttempt_legacy_endpointKey"();
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
