-- Ringee AI: persistent conversations, messages, and tool events.
-- One agent type is active for the MVP (`prospecting_expert`); the others
-- exist in the enum so future agents can be turned on without a migration.

CREATE TYPE "AiAgentType" AS ENUM (
  'prospecting_expert',
  'campaign_builder',
  'crm',
  'call_coach',
  'analytics'
);

CREATE TYPE "AiMessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');

CREATE TYPE "AiMessageStatus" AS ENUM (
  'pending',
  'streaming',
  'completed',
  'failed'
);

CREATE TYPE "AiToolEventKind" AS ENUM (
  'tool_call',
  'tool_result',
  'prospect_results',
  'confirmation_request',
  'confirmation_resolved',
  'prospects_saved',
  'list_created',
  'error'
);

CREATE TABLE "AiConversation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "organizationId" UUID,
  "agent" "AiAgentType" NOT NULL,
  "title" TEXT,
  "providerSelection" TEXT,
  "agentState" JSONB,
  "summary" TEXT,
  "summaryTokens" INTEGER,
  "lastMessageAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiConversation"
  ADD CONSTRAINT "AiConversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "AiConversation"
  ADD CONSTRAINT "AiConversation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;

CREATE INDEX "AiConversation_userId_idx" ON "AiConversation"("userId");
CREATE INDEX "AiConversation_organizationId_idx" ON "AiConversation"("organizationId");
CREATE INDEX "AiConversation_userId_agent_idx" ON "AiConversation"("userId", "agent");
CREATE INDEX "AiConversation_lastMessageAt_idx" ON "AiConversation"("lastMessageAt");

CREATE TABLE "AiMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL,
  "userId" UUID,
  "role" "AiMessageRole" NOT NULL,
  "status" "AiMessageStatus" NOT NULL DEFAULT 'completed',
  "content" TEXT,
  "toolName" TEXT,
  "toolPayload" JSONB,
  "model" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "cachedTokens" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiMessage"
  ADD CONSTRAINT "AiMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE;

ALTER TABLE "AiMessage"
  ADD CONSTRAINT "AiMessage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;

CREATE INDEX "AiMessage_conversationId_idx" ON "AiMessage"("conversationId");
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

CREATE TABLE "AiToolEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL,
  "messageId" UUID,
  "kind" "AiToolEventKind" NOT NULL,
  "payload" JSONB NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "resolutionData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiToolEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiToolEvent"
  ADD CONSTRAINT "AiToolEvent_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE;

ALTER TABLE "AiToolEvent"
  ADD CONSTRAINT "AiToolEvent_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "AiMessage"("id") ON DELETE SET NULL;

CREATE INDEX "AiToolEvent_conversationId_idx" ON "AiToolEvent"("conversationId");
CREATE INDEX "AiToolEvent_conversationId_kind_idx" ON "AiToolEvent"("conversationId", "kind");
