-- CRM member links: which CRM user a workspace member is, per connection.
--
-- A member is linked to the CRM user with their e-mail without any row here;
-- a row exists only when an admin linked them by hand (to another CRM user,
-- or to nobody). Records Ringee creates in the CRM on a member's behalf — the
-- person a first call creates, the call activity — take the linked CRM user as
-- their owner.
--
-- Additive: one new table, no change to an existing column or row. It starts
-- empty, so the foreign keys onto "CrmConnection" and "User" validate
-- instantly and only hold their locks for a moment.

-- CreateTable
CREATE TABLE "CrmMemberLink" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "CrmProviderType" NOT NULL,
    "externalMemberId" TEXT,
    "externalMemberEmail" TEXT,
    "externalMemberName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmMemberLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmMemberLink_userId_idx" ON "CrmMemberLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmMemberLink_connectionId_userId_key" ON "CrmMemberLink"("connectionId", "userId");

-- AddForeignKey
ALTER TABLE "CrmMemberLink" ADD CONSTRAINT "CrmMemberLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CrmConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmMemberLink" ADD CONSTRAINT "CrmMemberLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

