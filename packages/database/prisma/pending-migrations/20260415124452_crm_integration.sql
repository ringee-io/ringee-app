-- Move this file to: prisma/migrations/20260415124452_crm_integration/migration.sql
-- (directory is owned by root — run once:  sudo chown -R $(whoami):staff packages/database/prisma/migrations)

-- CreateEnum
CREATE TYPE "CrmProviderType" AS ENUM ('attio', 'hubspot', 'salesforce');

-- CreateEnum
CREATE TYPE "CrmConnectionScope" AS ENUM ('personal', 'organization');

-- CreateEnum
CREATE TYPE "CrmConnectionStatus" AS ENUM ('active', 'expired', 'revoked', 'error', 'disconnected');

-- CreateEnum
CREATE TYPE "CrmRecordType" AS ENUM ('person', 'company');

-- CreateEnum
CREATE TYPE "CrmSyncStatus" AS ENUM ('pending', 'in_progress', 'done', 'failed', 'skipped', 'needs_resolution');

-- CreateEnum
CREATE TYPE "CrmOutboxStatus" AS ENUM ('pending', 'in_progress', 'sent', 'failed');

-- CreateTable
CREATE TABLE "CrmConnection" (
    "id" UUID NOT NULL,
    "provider" "CrmProviderType" NOT NULL,
    "scope" "CrmConnectionScope" NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "externalAccountId" TEXT NOT NULL,
    "externalAccountName" TEXT,
    "accessTokenCiphertext" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "status" "CrmConnectionStatus" NOT NULL DEFAULT 'active',
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "providerMetadata" JSONB,
    "capabilities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmContactLink" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "contactId" UUID,
    "provider" "CrmProviderType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalType" "CrmRecordType" NOT NULL,
    "phoneNumberE164" TEXT NOT NULL,
    "matchConfidence" TEXT NOT NULL DEFAULT 'phone_exact',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContactLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCallSync" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "provider" "CrmProviderType" NOT NULL,
    "callId" UUID NOT NULL,
    "externalActivityId" TEXT,
    "externalRecordId" TEXT,
    "externalRecordType" "CrmRecordType",
    "status" "CrmSyncStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "payloadSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCallSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmOutboxEvent" (
    "id" UUID NOT NULL,
    "connectionId" UUID,
    "provider" "CrmProviderType" NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "CrmOutboxStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFieldMapping" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "provider" "CrmProviderType" NOT NULL,
    "ringeeEntity" TEXT NOT NULL,
    "ringeeField" TEXT NOT NULL,
    "externalEntity" TEXT NOT NULL,
    "externalField" TEXT NOT NULL,
    "transform" JSONB,
    "direction" TEXT NOT NULL DEFAULT 'push',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmConnection_scope_organizationId_provider_key" ON "CrmConnection"("scope", "organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "CrmConnection_scope_userId_provider_organizationId_key" ON "CrmConnection"("scope", "userId", "provider", "organizationId");

-- CreateIndex
CREATE INDEX "CrmConnection_provider_status_idx" ON "CrmConnection"("provider", "status");

-- CreateIndex
CREATE INDEX "CrmConnection_userId_idx" ON "CrmConnection"("userId");

-- CreateIndex
CREATE INDEX "CrmConnection_organizationId_idx" ON "CrmConnection"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmContactLink_connectionId_externalType_externalId_key" ON "CrmContactLink"("connectionId", "externalType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmContactLink_connectionId_phoneNumberE164_key" ON "CrmContactLink"("connectionId", "phoneNumberE164");

-- CreateIndex
CREATE INDEX "CrmContactLink_contactId_idx" ON "CrmContactLink"("contactId");

-- CreateIndex
CREATE INDEX "CrmContactLink_phoneNumberE164_idx" ON "CrmContactLink"("phoneNumberE164");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallSync_connectionId_callId_key" ON "CrmCallSync"("connectionId", "callId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallSync_idempotencyKey_key" ON "CrmCallSync"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CrmCallSync_status_nextAttemptAt_idx" ON "CrmCallSync"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CrmCallSync_callId_idx" ON "CrmCallSync"("callId");

-- CreateIndex
CREATE INDEX "CrmCallSync_connectionId_idx" ON "CrmCallSync"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmOutboxEvent_dedupeKey_key" ON "CrmOutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "CrmOutboxEvent_status_nextAttemptAt_idx" ON "CrmOutboxEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CrmOutboxEvent_provider_idx" ON "CrmOutboxEvent"("provider");

-- CreateIndex
CREATE INDEX "CrmOutboxEvent_connectionId_idx" ON "CrmOutboxEvent"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmFieldMapping_connectionId_ringeeEntity_ringeeField_key" ON "CrmFieldMapping"("connectionId", "ringeeEntity", "ringeeField");

-- CreateIndex
CREATE INDEX "CrmFieldMapping_connectionId_idx" ON "CrmFieldMapping"("connectionId");

-- AddForeignKey
ALTER TABLE "CrmConnection" ADD CONSTRAINT "CrmConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmConnection" ADD CONSTRAINT "CrmConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContactLink" ADD CONSTRAINT "CrmContactLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CrmConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContactLink" ADD CONSTRAINT "CrmContactLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCallSync" ADD CONSTRAINT "CrmCallSync_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CrmConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCallSync" ADD CONSTRAINT "CrmCallSync_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFieldMapping" ADD CONSTRAINT "CrmFieldMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CrmConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
