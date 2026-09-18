-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "externalCarrierId" UUID,
ADD COLUMN     "externalSipEndpointId" UUID;

-- AlterTable
ALTER TABLE "ExternalSipEndpoint" ADD COLUMN     "providerFqdn" TEXT;

-- CreateIndex
CREATE INDEX "ExternalSipEndpoint_providerFqdn_idx" ON "ExternalSipEndpoint"("providerFqdn");
