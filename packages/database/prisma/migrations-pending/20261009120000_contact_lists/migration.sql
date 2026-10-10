-- Contact lists (LIST-001..LIST-004).
--
-- A list is a named set of contacts somebody works through: an admin builds one
-- and assigns it to a member, a member builds their own. Everything here is
-- additive — two new tables, no change to an existing column or row:
--
-- - `ContactList` carries the workspace (`userId` = who created it,
--   `organizationId`) and who works it (`assignedToId`).
-- - `ContactListEntry` puts an existing `Contact` in a list, once per list.
--   `sequence` is a BIGSERIAL so the rows of one CSV keep the file's order;
--   it is the order a list is worked in.
--
-- Both tables start empty, so the foreign keys onto "User", "Organization" and
-- "Contact" validate instantly and only hold their locks for a moment.

-- CreateTable
CREATE TABLE "ContactList" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "assignedToId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactListEntry" (
    "id" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "addedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactListEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactList_userId_idx" ON "ContactList"("userId");

-- CreateIndex
CREATE INDEX "ContactList_organizationId_idx" ON "ContactList"("organizationId");

-- CreateIndex
CREATE INDEX "ContactList_assignedToId_idx" ON "ContactList"("assignedToId");

-- CreateIndex
CREATE INDEX "ContactListEntry_listId_sequence_idx" ON "ContactListEntry"("listId", "sequence");

-- CreateIndex
CREATE INDEX "ContactListEntry_contactId_idx" ON "ContactListEntry"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactListEntry_listId_contactId_key" ON "ContactListEntry"("listId", "contactId");

-- AddForeignKey
ALTER TABLE "ContactList" ADD CONSTRAINT "ContactList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactList" ADD CONSTRAINT "ContactList_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactList" ADD CONSTRAINT "ContactList_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactListEntry" ADD CONSTRAINT "ContactListEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactListEntry" ADD CONSTRAINT "ContactListEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactListEntry" ADD CONSTRAINT "ContactListEntry_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

