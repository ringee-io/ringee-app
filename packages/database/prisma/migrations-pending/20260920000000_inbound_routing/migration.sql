-- CreateEnum
CREATE TYPE "InboundDestinationType" AS ENUM ('user', 'ring_group', 'desk_phone', 'ivr', 'ai_receptionist');

-- CreateEnum
CREATE TYPE "RingGroupStrategy" AS ENUM ('simultaneous');

-- CreateEnum
CREATE TYPE "InboundRingAttemptStatus" AS ENUM ('ringing', 'answered', 'cancelled', 'failed');

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "inboundRouteId" UUID,
ADD COLUMN     "inboundDestinationType" "InboundDestinationType",
ADD COLUMN     "inboundDestinationId" UUID,
ADD COLUMN     "routedAt" TIMESTAMP(3),
ADD COLUMN     "ringGroupId" UUID,
ADD COLUMN     "answeredByUserId" UUID;

-- CreateTable
CREATE TABLE "InboundRoute" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "numberId" UUID,
    "externalNumberId" UUID,
    "destinationType" "InboundDestinationType" NOT NULL,
    "destinationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RingGroup" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "name" TEXT NOT NULL,
    "strategy" "RingGroupStrategy" NOT NULL DEFAULT 'simultaneous',
    "ringSeconds" INTEGER NOT NULL DEFAULT 30,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RingGroupMember" (
    "id" UUID NOT NULL,
    "ringGroupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RingGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundRingAttempt" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "userId" UUID,
    "sipDeviceId" UUID,
    "status" "InboundRingAttemptStatus" NOT NULL DEFAULT 'ringing',
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "InboundRingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundRoute_numberId_key" ON "InboundRoute"("numberId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundRoute_externalNumberId_key" ON "InboundRoute"("externalNumberId");

-- CreateIndex
CREATE INDEX "InboundRoute_userId_idx" ON "InboundRoute"("userId");

-- CreateIndex
CREATE INDEX "InboundRoute_organizationId_idx" ON "InboundRoute"("organizationId");

-- CreateIndex
CREATE INDEX "InboundRoute_destinationType_destinationId_idx" ON "InboundRoute"("destinationType", "destinationId");

-- CreateIndex
CREATE INDEX "RingGroup_userId_idx" ON "RingGroup"("userId");

-- CreateIndex
CREATE INDEX "RingGroup_organizationId_idx" ON "RingGroup"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RingGroupMember_ringGroupId_userId_key" ON "RingGroupMember"("ringGroupId", "userId");

-- CreateIndex
CREATE INDEX "RingGroupMember_userId_idx" ON "RingGroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundRingAttempt_callId_userId_key" ON "InboundRingAttempt"("callId", "userId");

-- CreateIndex
CREATE INDEX "InboundRingAttempt_callId_idx" ON "InboundRingAttempt"("callId");

-- CreateIndex
CREATE INDEX "InboundRingAttempt_userId_idx" ON "InboundRingAttempt"("userId");

-- CreateIndex
CREATE INDEX "Call_inboundRouteId_idx" ON "Call"("inboundRouteId");

-- CreateIndex
CREATE INDEX "Call_ringGroupId_idx" ON "Call"("ringGroupId");

-- CreateIndex
CREATE INDEX "Call_answeredByUserId_idx" ON "Call"("answeredByUserId");

-- A route belongs to exactly one number. Prisma cannot express this, but the
-- routing layer reads `numberId` and `externalNumberId` as mutually exclusive
-- and a row with both — or neither — would resolve to the wrong workspace.
ALTER TABLE "InboundRoute" ADD CONSTRAINT "InboundRoute_one_number"
  CHECK (("numberId" IS NULL) <> ("externalNumberId" IS NULL));

-- AddForeignKey
ALTER TABLE "InboundRoute" ADD CONSTRAINT "InboundRoute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRoute" ADD CONSTRAINT "InboundRoute_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRoute" ADD CONSTRAINT "InboundRoute_numberId_fkey" FOREIGN KEY ("numberId") REFERENCES "NumberPurchased"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRoute" ADD CONSTRAINT "InboundRoute_externalNumberId_fkey" FOREIGN KEY ("externalNumberId") REFERENCES "ExternalPhoneNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RingGroup" ADD CONSTRAINT "RingGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RingGroup" ADD CONSTRAINT "RingGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RingGroupMember" ADD CONSTRAINT "RingGroupMember_ringGroupId_fkey" FOREIGN KEY ("ringGroupId") REFERENCES "RingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RingGroupMember" ADD CONSTRAINT "RingGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRingAttempt" ADD CONSTRAINT "InboundRingAttempt_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRingAttempt" ADD CONSTRAINT "InboundRingAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRingAttempt" ADD CONSTRAINT "InboundRingAttempt_sipDeviceId_fkey" FOREIGN KEY ("sipDeviceId") REFERENCES "SipDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_inboundRouteId_fkey" FOREIGN KEY ("inboundRouteId") REFERENCES "InboundRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_ringGroupId_fkey" FOREIGN KEY ("ringGroupId") REFERENCES "RingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_answeredByUserId_fkey" FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
