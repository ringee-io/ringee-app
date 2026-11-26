-- Telnyx outbound CPS cost protection (docs/telnyx-cps-cost-protection.md,
-- CPS-001..CPS-012). Transactional and additive. PostgreSQL 12+.
--
--   AiVoiceAgentCallDispatch   why an agent call is waiting for provider
--                              capacity, and where it stands (the queue)
--   ProviderDispatchHour       what Ringee's dispatch counted per UTC hour: the
--                              input of the monthly surcharge estimate
--   ProviderDispatchSetting    an administrator's overrides of the pacing limits
--
-- Apply BEFORE setting DISPATCH_QUEUE_ENABLED=true, and before using the
-- backoffice dispatch controls or expecting the hourly statistics to persist.
-- Apply this schema before releasing the binary: credit settlement and
-- agent-call reads use the new tables even while the queue is disabled.
-- A cold settings-store outage safely defers new outbound calls.
--
-- Then RUN BY HAND, with psql and autocommit (no transaction):
--   pending-migrations/20261124150100_provider_dispatch_status_values.sql
-- It adds `queued`, `cancelled` and `expired` to AiVoiceAgentCallStatus. A new
-- enum value cannot be used in the transaction that adds it, so it is a script
-- of its own, like the receptionist agent type before it.
--
-- No backfill, no existing row is touched, no existing column changes.
--
-- Rollback: disabling the queue does not remove binary dependencies on these
-- tables. Drain or cancel waiting operations, reconcile held reservations and
-- roll back every API/worker binary first. Retain the additive tables and enum
-- values during rollback; do not drop data needed for financial reconciliation.

-- CreateEnum
CREATE TYPE "AiVoiceAgentCallDispatchState" AS ENUM ('queued', 'dispatched', 'cancelled', 'expired', 'failed');

-- CreateTable
CREATE TABLE "CreditReservation" (
    "id" UUID NOT NULL,
    "creditId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL CHECK ("amount" > 0),
    "state" TEXT NOT NULL DEFAULT 'held' CHECK ("state" IN ('held', 'released', 'settled')),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditReservation_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CreditReservation_idempotencyKey_key" ON "CreditReservation"("idempotencyKey");
CREATE INDEX "CreditReservation_creditId_state_expiresAt_idx" ON "CreditReservation"("creditId", "state", "expiresAt");

-- CreateTable
CREATE TABLE "AiVoiceAgentCallDispatch" (
    "agentCallId" UUID NOT NULL,
    "workspaceKey" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "providerAccountKey" TEXT NOT NULL,
    "trafficLevel" INTEGER NOT NULL DEFAULT 3,
    "source" TEXT NOT NULL,
    "integrationId" UUID,
    "state" "AiVoiceAgentCallDispatchState" NOT NULL DEFAULT 'queued',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimToken" UUID,
    "claimedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVoiceAgentCallDispatch_pkey" PRIMARY KEY ("agentCallId")
);

-- CreateTable
CREATE TABLE "ProviderDispatchHour" (
    "id" UUID NOT NULL,
    "providerAccountKey" TEXT NOT NULL,
    "hourStart" TIMESTAMP(3) NOT NULL,
    "peakCps" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "counters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderDispatchHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderDispatchSetting" (
    "id" UUID NOT NULL,
    "providerAccountKey" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedByUserId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderDispatchSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiVoiceAgentCallDispatch_state_trafficLevel_queuedAt_idx" ON "AiVoiceAgentCallDispatch"("state", "trafficLevel", "queuedAt");

-- CreateIndex
CREATE INDEX "AiVoiceAgentCallDispatch_workspaceKey_state_idx" ON "AiVoiceAgentCallDispatch"("workspaceKey", "state");

-- CreateIndex
CREATE INDEX "AiVoiceAgentCallDispatch_state_expiresAt_idx" ON "AiVoiceAgentCallDispatch"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "ProviderDispatchHour_hourStart_idx" ON "ProviderDispatchHour"("hourStart");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderDispatchHour_providerAccountKey_hourStart_key" ON "ProviderDispatchHour"("providerAccountKey", "hourStart");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderDispatchSetting_providerAccountKey_key_key" ON "ProviderDispatchSetting"("providerAccountKey", "key");

-- AddForeignKey
ALTER TABLE "AiVoiceAgentCallDispatch" ADD CONSTRAINT "AiVoiceAgentCallDispatch_agentCallId_fkey" FOREIGN KEY ("agentCallId") REFERENCES "AiVoiceAgentCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
