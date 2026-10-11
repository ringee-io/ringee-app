-- CreateEnum
CREATE TYPE "DemoRequestStatus" AS ENUM ('received', 'approved', 'account_created', 'needs_info', 'manual_review');

-- AlterTable
ALTER TABLE "DemoRequest" ADD COLUMN     "accountCreatedAt" TIMESTAMP(3),
ADD COLUMN     "clerkUserId" TEXT,
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "review" JSONB,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "status" "DemoRequestStatus" NOT NULL DEFAULT 'received',
ADD COLUMN     "statusReason" TEXT;

-- Requests stored before the automatic review were vetted by hand (LIFE-004).
-- Left as 'received' they would read as still waiting on the review.
UPDATE "DemoRequest"
SET "status" = 'manual_review',
    "statusReason" = 'Received before the automatic review existed';
