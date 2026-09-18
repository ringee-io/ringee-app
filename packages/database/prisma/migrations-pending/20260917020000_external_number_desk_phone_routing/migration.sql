-- AlterTable
ALTER TABLE "ExternalPhoneNumber" ADD COLUMN     "inboundSipDeviceId" UUID;

-- CreateIndex
CREATE INDEX "ExternalPhoneNumber_inboundSipDeviceId_idx" ON "ExternalPhoneNumber"("inboundSipDeviceId");

-- AddForeignKey
ALTER TABLE "ExternalPhoneNumber" ADD CONSTRAINT "ExternalPhoneNumber_inboundSipDeviceId_fkey" FOREIGN KEY ("inboundSipDeviceId") REFERENCES "SipDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
