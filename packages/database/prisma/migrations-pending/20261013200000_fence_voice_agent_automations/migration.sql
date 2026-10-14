-- Additive recovery metadata. Stop old workers before deploying the new worker.
ALTER TABLE "MeetingReminderExecution" ADD COLUMN "claimToken" UUID, ADD COLUMN "dialReservedAt" TIMESTAMP(3);
UPDATE "MeetingReminderExecution" SET "dialReservedAt" = "updatedAt" WHERE "dialTries" > 0;

ALTER TABLE "MeetingEmailDelivery"
  ADD COLUMN "scheduleVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "claimToken" UUID,
  ADD COLUMN "sendPayload" JSONB,
  ADD COLUMN "firstAttemptAt" TIMESTAMP(3);

-- The existing dedupe key contains the version the lead actually answered.
UPDATE "MeetingEmailDelivery"
SET "scheduleVersion" = substring("idempotencyKey" from ':v([0-9]+):')::integer
WHERE "idempotencyKey" ~ ':v[0-9]+:';

-- A legacy attempted delivery has no frozen payload or known first-send time.
-- It may already have reached the provider: do not replay it automatically.
UPDATE "MeetingEmailDelivery"
SET "firstAttemptAt" = "createdAt",
    "status" = 'failed'::"MeetingEmailDeliveryStatus",
    "leaseExpiresAt" = NULL,
    "lastError" = 'Delivery predates durable send metadata; reconcile with the provider before retrying.'
WHERE "attempts" > 0 AND "status" IN ('pending', 'sending', 'failed', 'needs_email', 'needs_member');

