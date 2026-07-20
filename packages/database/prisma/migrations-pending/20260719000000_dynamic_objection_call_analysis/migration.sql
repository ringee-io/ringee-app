-- One durable, at-most-once semantic extraction claim per eligible call.
CREATE TYPE "ObjectionCallAnalysisStatus" AS ENUM ('processing', 'completed', 'failed');

CREATE TABLE "ObjectionCallAnalysis" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "contextType" "AiPipelineContextType" NOT NULL,
    "contextKey" TEXT NOT NULL,
    "campaignId" UUID,
    "organizationId" UUID,
    "userId" UUID,
    "status" "ObjectionCallAnalysisStatus" NOT NULL DEFAULT 'processing',
    "outcomeClass" TEXT,
    "language" TEXT,
    "model" TEXT,
    "objections" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectionCallAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ObjectionCallAnalysis_callId_key"
  ON "ObjectionCallAnalysis"("callId");
CREATE INDEX "ObjectionCallAnalysis_contextKey_status_idx"
  ON "ObjectionCallAnalysis"("contextKey", "status");
CREATE INDEX "ObjectionCallAnalysis_campaignId_idx"
  ON "ObjectionCallAnalysis"("campaignId");
CREATE INDEX "ObjectionCallAnalysis_organizationId_idx"
  ON "ObjectionCallAnalysis"("organizationId");
CREATE INDEX "ObjectionCallAnalysis_userId_idx"
  ON "ObjectionCallAnalysis"("userId");

-- New insights are dynamic by definition; historical rows keep their values.
ALTER TABLE "ObjectionInsight" ALTER COLUMN "dynamic" SET DEFAULT true;
