-- A campaign may dial through the workspace's own carrier (BYOC): it names one
-- of the organization's external numbers. Deleting that number leaves the
-- campaign without one rather than blocking the delete.

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "externalNumberId" UUID;

-- CreateIndex
CREATE INDEX "Campaign_externalNumberId_idx" ON "Campaign"("externalNumberId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_externalNumberId_fkey" FOREIGN KEY ("externalNumberId") REFERENCES "ExternalPhoneNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
