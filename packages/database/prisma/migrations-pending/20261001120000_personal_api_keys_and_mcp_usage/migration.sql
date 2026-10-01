-- CreateEnum
CREATE TYPE "PersonalApiKeySource" AS ENUM ('dashboard', 'cli');

-- CreateEnum
CREATE TYPE "CliAuthRequestStatus" AS ENUM ('pending', 'approved', 'denied', 'consumed');

-- CreateEnum
CREATE TYPE "McpUsageEventType" AS ENUM ('connect', 'tool_call');

-- CreateEnum
CREATE TYPE "McpUsageSurface" AS ENUM ('mcp', 'cli');

-- CreateEnum
CREATE TYPE "McpUsageAuthMethod" AS ENUM ('api_key', 'url', 'oauth');

-- CreateTable
CREATE TABLE "PersonalApiKey" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "source" "PersonalApiKeySource" NOT NULL DEFAULT 'dashboard',
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "lastClientName" TEXT,
    "lastClientVersion" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CliAuthRequest" (
    "id" UUID NOT NULL,
    "userCode" TEXT NOT NULL,
    "deviceCodeHash" TEXT NOT NULL,
    "status" "CliAuthRequestStatus" NOT NULL DEFAULT 'pending',
    "deviceName" TEXT,
    "platform" TEXT,
    "clientVersion" TEXT,
    "requestIp" TEXT,
    "userId" UUID,
    "apiKeyId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CliAuthRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpUsageEvent" (
    "id" UUID NOT NULL,
    "type" "McpUsageEventType" NOT NULL,
    "surface" "McpUsageSurface" NOT NULL,
    "authMethod" "McpUsageAuthMethod" NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "apiKeyId" UUID,
    "clientName" TEXT,
    "clientVersion" TEXT,
    "toolName" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalApiKey_prefix_key" ON "PersonalApiKey"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalApiKey_keyHash_key" ON "PersonalApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "PersonalApiKey_userId_idx" ON "PersonalApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CliAuthRequest_userCode_key" ON "CliAuthRequest"("userCode");

-- CreateIndex
CREATE UNIQUE INDEX "CliAuthRequest_deviceCodeHash_key" ON "CliAuthRequest"("deviceCodeHash");

-- CreateIndex
CREATE INDEX "CliAuthRequest_expiresAt_idx" ON "CliAuthRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "McpUsageEvent_createdAt_idx" ON "McpUsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "McpUsageEvent_userId_createdAt_idx" ON "McpUsageEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PersonalApiKey" ADD CONSTRAINT "PersonalApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CliAuthRequest" ADD CONSTRAINT "CliAuthRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpUsageEvent" ADD CONSTRAINT "McpUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

