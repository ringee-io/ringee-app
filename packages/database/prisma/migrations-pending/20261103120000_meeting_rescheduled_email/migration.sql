-- A meeting an AI voice agent moved on a call (AGENT-021), and the email that
-- says so (AGENT-020). Additive: one enum value and two nullable columns on
-- "MeetingEmailDelivery". Apply before the backend that writes them: a move
-- creates its email in the same transaction, so without the value the move
-- itself is refused.

-- AlterEnum
ALTER TYPE "MeetingEmailKind" ADD VALUE 'rescheduled';

-- AlterTable
ALTER TABLE "MeetingEmailDelivery" ADD COLUMN     "agentCallId" UUID,
ADD COLUMN     "previousScheduledAt" TIMESTAMP(3);
