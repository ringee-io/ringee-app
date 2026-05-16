-- Ringee AI: token usage + cost tracking
ALTER TABLE "AiConversation"
  ADD COLUMN "totalCostCredits" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "AiMessage"
  ADD COLUMN "cacheWriteTokens" INTEGER,
  ADD COLUMN "costCredits" DOUBLE PRECISION;
