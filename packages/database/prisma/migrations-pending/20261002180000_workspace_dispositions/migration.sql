-- Workspace dispositions (DISP-001..DISP-006).
--
-- A disposition stops being something only a campaign owns: a workspace keeps
-- its own list ("Demo booked", "Wrong person"…), each mapped onto the canonical
-- CallOutcome, and campaigns pick from it. Everything here is additive:
--
-- - The dispositions every existing campaign was seeded with keep their
--   `campaignId` and keep working as they do today. A row with no campaign is a
--   workspace disposition, owned through `userId` / `organizationId`.
-- - No workspace gets rows from this migration. Its defaults are created the
--   first time anything reads its dispositions (DISP-003), so a workspace that
--   never uses them stays empty.
-- - `Call.outcome` keeps its meaning. `dispositionId` / `dispositionName` only
--   record which disposition produced it.
--
-- The `Call` and `CallAttempt` indexes and the `Call` foreign key are
-- deliberately NOT in this migration. Built here they would lock those tables
-- against writes — live call handling and the campaign dialer — for a full-table
-- index build and FK validation, inside Prisma's transaction. They are applied
-- after this migration, by hand, from
-- prisma/pending-migrations/20261002180100_workspace_dispositions_call_indexes.sql
-- (CREATE INDEX CONCURRENTLY, then FOREIGN KEY ... NOT VALID, then VALIDATE).
-- Until that file has run, the database lags schema.prisma by exactly those
-- three. ADD COLUMN on nullable columns is metadata-only, so this file is fast.

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "dispositionId" UUID,
ADD COLUMN     "dispositionName" TEXT;

-- AlterTable
ALTER TABLE "CallAttempt" ADD COLUMN     "dispositionOutcome" "CallOutcome";

-- AlterTable
ALTER TABLE "Disposition" ADD COLUMN     "canonicalOutcome" "CallOutcome",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organizationId" UUID,
ADD COLUMN     "userId" UUID,
ALTER COLUMN "campaignId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CampaignDisposition" (
    "campaignId" UUID NOT NULL,
    "dispositionId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignDisposition_pkey" PRIMARY KEY ("campaignId","dispositionId")
);

-- CreateIndex
CREATE INDEX "CampaignDisposition_dispositionId_idx" ON "CampaignDisposition"("dispositionId");

-- CreateIndex
CREATE INDEX "Disposition_userId_idx" ON "Disposition"("userId");

-- CreateIndex
CREATE INDEX "Disposition_organizationId_idx" ON "Disposition"("organizationId");

-- AddForeignKey
ALTER TABLE "Disposition" ADD CONSTRAINT "Disposition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disposition" ADD CONSTRAINT "Disposition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDisposition" ADD CONSTRAINT "CampaignDisposition_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDisposition" ADD CONSTRAINT "CampaignDisposition_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "Disposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
