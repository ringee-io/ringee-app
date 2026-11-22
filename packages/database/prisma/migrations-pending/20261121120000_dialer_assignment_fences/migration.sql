ALTER TABLE "AgentSession" ADD COLUMN "reservedAt" TIMESTAMP(3);
ALTER TABLE "CallAttempt" ADD COLUMN "sessionStartedAt" TIMESTAMP(3);

-- Existing reservations start their recovery window at migration time: their
-- heartbeat-updated updatedAt cannot identify when the reservation was claimed.
UPDATE "AgentSession" SET "reservedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "status" = 'reserved';

-- Backfill attempts created during the current incarnation. Dispatch time can
-- move after creation and must not reattribute historical attempts.
-- Older historical attempts remain unbound and cannot drive a replacement.
UPDATE "CallAttempt" attempt SET "sessionStartedAt" = session."startedAt"
FROM "AgentSession" session
WHERE attempt."agentSessionId" = session."id"
  AND attempt."createdAt" >= session."startedAt";
