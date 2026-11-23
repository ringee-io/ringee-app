ALTER TABLE "AgentSession" ADD COLUMN "reservedAt" TIMESTAMP(3);
ALTER TABLE "CallAttempt" ADD COLUMN "sessionStartedAt" TIMESTAMP(3);

-- Existing reservations start their recovery window at migration time: their
-- heartbeat-updated updatedAt cannot identify when the reservation was claimed.
UPDATE "AgentSession" SET "reservedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "status" = 'reserved';
