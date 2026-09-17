-- CreateTable
CREATE TABLE "ExternalCarrier" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mutationToken" UUID,
    "mutationExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCarrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSipEndpoint" (
    "id" UUID NOT NULL,
    "carrierId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "extension" TEXT NOT NULL,
    "proxy" TEXT NOT NULL,
    "sipUsername" TEXT NOT NULL,
    "sipPasswordEncrypted" TEXT NOT NULL,
    "authUsername" TEXT,
    "fromUser" TEXT,
    "outboundProxy" TEXT,
    "transport" TEXT NOT NULL DEFAULT 'TLS',
    "expirationSec" INTEGER NOT NULL DEFAULT 600,
    "provider" TEXT NOT NULL DEFAULT 'telnyx',
    "providerConnectionId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "registrationStatus" TEXT NOT NULL DEFAULT 'unknown',
    "providerStatus" TEXT,
    "lastRegisteredAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastIpAddress" TEXT,
    "lastPort" INTEGER,
    "lastTransport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalSipEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPhoneNumber" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPhoneNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalCarrier_organizationId_idx" ON "ExternalCarrier"("organizationId");

-- CreateIndex
CREATE INDEX "ExternalCarrier_userId_idx" ON "ExternalCarrier"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCarrier_id_organizationId_key" ON "ExternalCarrier"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSipEndpoint_providerConnectionId_key" ON "ExternalSipEndpoint"("providerConnectionId");

-- CreateIndex
CREATE INDEX "ExternalSipEndpoint_carrierId_idx" ON "ExternalSipEndpoint"("carrierId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSipEndpoint_id_organizationId_key" ON "ExternalSipEndpoint"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSipEndpoint_carrierId_extension_key" ON "ExternalSipEndpoint"("carrierId", "extension");

-- CreateIndex
CREATE INDEX "ExternalPhoneNumber_phoneNumber_idx" ON "ExternalPhoneNumber"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPhoneNumber_organizationId_phoneNumber_key" ON "ExternalPhoneNumber"("organizationId", "phoneNumber");

-- AddForeignKey
ALTER TABLE "ExternalCarrier" ADD CONSTRAINT "ExternalCarrier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCarrier" ADD CONSTRAINT "ExternalCarrier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSipEndpoint" ADD CONSTRAINT "ExternalSipEndpoint_carrierId_organizationId_fkey" FOREIGN KEY ("carrierId", "organizationId") REFERENCES "ExternalCarrier"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPhoneNumber" ADD CONSTRAINT "ExternalPhoneNumber_endpointId_organizationId_fkey" FOREIGN KEY ("endpointId", "organizationId") REFERENCES "ExternalSipEndpoint"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

