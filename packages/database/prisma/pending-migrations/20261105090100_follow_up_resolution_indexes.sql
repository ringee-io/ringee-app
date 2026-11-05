-- Apply after 20261105090000_follow_up_resolution, outside a transaction.
-- Complete before enabling the updated pilot worker. No Call-table index.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ContactNote_automationActionId_key"
  ON "ContactNote"("automationActionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MeetingEmailDelivery_actionId_idx"
  ON "MeetingEmailDelivery"("actionId");
ALTER TABLE "MeetingEmailDelivery" VALIDATE CONSTRAINT "MeetingEmailDelivery_actionId_fkey";
