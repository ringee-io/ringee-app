-- AlterTable
ALTER TABLE "DemoRequest" ADD COLUMN     "teamNotifiedAt" TIMESTAMP(3);

-- Requests already handed to the team were announced when they arrived, by
-- the "New demo request" email (LIFE-004). Marked so nothing announces them
-- again.
UPDATE "DemoRequest"
SET "teamNotifiedAt" = "createdAt"
WHERE "status" = 'manual_review';
