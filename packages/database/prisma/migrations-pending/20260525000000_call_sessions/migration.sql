-- CallSession enums
CREATE TYPE "CallSessionStatus" AS ENUM ('draft', 'ready', 'active', 'paused', 'completed', 'expired', 'revoked');
CREATE TYPE "CallSessionSource" AS ENUM ('mcp', 'dashboard', 'api');
CREATE TYPE "CallSessionAccessMode" AS ENUM ('magic_link');
CREATE TYPE "CallSessionItemStatus" AS ENUM ('pending', 'calling', 'completed', 'skipped', 'failed');
CREATE TYPE "CallSessionAccessTokenType" AS ENUM ('magic_link');
CREATE TYPE "CallSessionAccessTokenStatus" AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE "CallSessionActorSource" AS ENUM ('mcp', 'dashboard', 'api', 'magic_link');
CREATE TYPE "CallSessionEventType" AS ENUM (
  'session_created',
  'session_opened',
  'session_updated',
  'session_deleted',
  'session_revoked',
  'call_started',
  'call_ended',
  'outcome_saved',
  'item_skipped',
  'credits_failed',
  'token_expired',
  'error'
);

-- CallSession
CREATE TABLE "CallSession" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"         UUID NOT NULL,
  "organizationId" UUID,
  "campaignId"     UUID,
  "title"          TEXT,
  "status"         "CallSessionStatus" NOT NULL DEFAULT 'ready',
  "source"         "CallSessionSource" NOT NULL DEFAULT 'api',
  "accessMode"     "CallSessionAccessMode" NOT NULL DEFAULT 'magic_link',
  "expiresAt"      TIMESTAMP(3),
  "maxCalls"       INTEGER,
  "callsCompleted" INTEGER NOT NULL DEFAULT 0,
  "startedAt"      TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3)
);

ALTER TABLE "CallSession"
  ADD CONSTRAINT "CallSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CallSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CallSession_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CallSession_userId_idx" ON "CallSession"("userId");
CREATE INDEX "CallSession_organizationId_idx" ON "CallSession"("organizationId");
CREATE INDEX "CallSession_campaignId_idx" ON "CallSession"("campaignId");
CREATE INDEX "CallSession_status_idx" ON "CallSession"("status");
CREATE INDEX "CallSession_expiresAt_idx" ON "CallSession"("expiresAt");
CREATE INDEX "CallSession_deletedAt_idx" ON "CallSession"("deletedAt");

-- CallSessionItem
CREATE TABLE "CallSessionItem" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "callSessionId" UUID NOT NULL,
  "contactId"     UUID,
  "phoneNumber"   VARCHAR(20) NOT NULL,
  "displayName"   TEXT,
  "company"       TEXT,
  "positionIndex" INTEGER NOT NULL,
  "status"        "CallSessionItemStatus" NOT NULL DEFAULT 'pending',
  "callId"        UUID,
  "outcome"       "CallOutcome",
  "outcomeNote"   TEXT,
  "callbackAt"    TIMESTAMP(3),
  "meetingId"     UUID,
  "startedAt"     TIMESTAMP(3),
  "endedAt"       TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);

ALTER TABLE "CallSessionItem"
  ADD CONSTRAINT "CallSessionItem_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CallSessionItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CallSessionItem_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CallSessionItem_callSessionId_positionIndex_key" ON "CallSessionItem"("callSessionId", "positionIndex");
CREATE INDEX "CallSessionItem_callSessionId_idx" ON "CallSessionItem"("callSessionId");
CREATE INDEX "CallSessionItem_callSessionId_status_idx" ON "CallSessionItem"("callSessionId", "status");
CREATE INDEX "CallSessionItem_contactId_idx" ON "CallSessionItem"("contactId");
CREATE INDEX "CallSessionItem_callId_idx" ON "CallSessionItem"("callId");

-- CallSessionAccessToken
CREATE TABLE "CallSessionAccessToken" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "callSessionId"   UUID NOT NULL,
  "tokenHash"       TEXT NOT NULL,
  "type"            "CallSessionAccessTokenType" NOT NULL DEFAULT 'magic_link',
  "status"          "CallSessionAccessTokenStatus" NOT NULL DEFAULT 'active',
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "lastUsedAt"      TIMESTAMP(3),
  "createdByUserId" UUID,
  "createdBySource" "CallSessionSource" NOT NULL DEFAULT 'api',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);

ALTER TABLE "CallSessionAccessToken"
  ADD CONSTRAINT "CallSessionAccessToken_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CallSessionAccessToken_tokenHash_key" ON "CallSessionAccessToken"("tokenHash");
CREATE INDEX "CallSessionAccessToken_callSessionId_idx" ON "CallSessionAccessToken"("callSessionId");
CREATE INDEX "CallSessionAccessToken_status_expiresAt_idx" ON "CallSessionAccessToken"("status", "expiresAt");

-- CallSessionEvent
CREATE TABLE "CallSessionEvent" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "callSessionId" UUID NOT NULL,
  "type"          "CallSessionEventType" NOT NULL,
  "actorUserId"   UUID,
  "actorSource"   "CallSessionActorSource",
  "ipAddress"     TEXT,
  "userAgent"     TEXT,
  "payload"       JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "CallSessionEvent"
  ADD CONSTRAINT "CallSessionEvent_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CallSessionEvent_callSessionId_createdAt_idx" ON "CallSessionEvent"("callSessionId", "createdAt");
CREATE INDEX "CallSessionEvent_type_idx" ON "CallSessionEvent"("type");
