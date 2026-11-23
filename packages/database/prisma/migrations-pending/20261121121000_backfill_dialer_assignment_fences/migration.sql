-- Backfill attempts created during the current incarnation. Dispatch time can
-- move after creation and must not reattribute historical attempts.
-- Older historical attempts remain unbound and cannot drive a replacement.
UPDATE "CallAttempt" attempt SET "sessionStartedAt" = session."startedAt"
FROM "AgentSession" session
WHERE attempt."agentSessionId" = session."id"
  AND attempt."createdAt" >= session."startedAt";
