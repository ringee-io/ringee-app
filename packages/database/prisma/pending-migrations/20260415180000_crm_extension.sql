-- Move this file to: prisma/migrations/20260415180000_crm_extension/migration.sql
-- Run after: 20260415124452_crm_integration
-- (directory is owned by root — run once: sudo chown -R $(whoami):staff packages/database/prisma/migrations)

-- AlterEnum: add 'list' to CrmRecordType
ALTER TYPE "CrmRecordType" ADD VALUE IF NOT EXISTS 'list';

-- AlterTable: extend Contact
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "ownerId" UUID;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "crmMetadata" JSONB;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "customFields" JSONB;

-- CreateIndex: Contact extensions
CREATE INDEX IF NOT EXISTS "Contact_ownerId_idx" ON "Contact"("ownerId");
CREATE INDEX IF NOT EXISTS "Contact_source_idx" ON "Contact"("source");

-- CreateTable: ContactPhone
CREATE TABLE IF NOT EXISTS "ContactPhone" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "phoneE164" VARCHAR(20),
    "type" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactPhone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactPhone_contactId_phone_key" ON "ContactPhone"("contactId", "phone");
CREATE INDEX IF NOT EXISTS "ContactPhone_contactId_idx" ON "ContactPhone"("contactId");
CREATE INDEX IF NOT EXISTS "ContactPhone_phoneE164_idx" ON "ContactPhone"("phoneE164");

ALTER TABLE "ContactPhone" ADD CONSTRAINT "ContactPhone_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ContactEmail
CREATE TABLE IF NOT EXISTS "ContactEmail" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "type" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactEmail_contactId_email_key" ON "ContactEmail"("contactId", "email");
CREATE INDEX IF NOT EXISTS "ContactEmail_contactId_idx" ON "ContactEmail"("contactId");
CREATE INDEX IF NOT EXISTS "ContactEmail_email_idx" ON "ContactEmail"("email");

ALTER TABLE "ContactEmail" ADD CONSTRAINT "ContactEmail_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Company
CREATE TABLE IF NOT EXISTS "Company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "phone" VARCHAR(30),
    "website" TEXT,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "source" TEXT,
    "crmMetadata" JSONB,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Company_userId_idx" ON "Company"("userId");
CREATE INDEX IF NOT EXISTS "Company_organizationId_idx" ON "Company"("organizationId");
CREATE INDEX IF NOT EXISTS "Company_domain_idx" ON "Company"("domain");
CREATE INDEX IF NOT EXISTS "Company_name_idx" ON "Company"("name");
CREATE INDEX IF NOT EXISTS "Company_deletedAt_idx" ON "Company"("deletedAt");

ALTER TABLE "Company" ADD CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ContactAffiliation
CREATE TABLE IF NOT EXISTS "ContactAffiliation" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "crmMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactAffiliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactAffiliation_contactId_companyId_key" ON "ContactAffiliation"("contactId", "companyId");
CREATE INDEX IF NOT EXISTS "ContactAffiliation_contactId_idx" ON "ContactAffiliation"("contactId");
CREATE INDEX IF NOT EXISTS "ContactAffiliation_companyId_idx" ON "ContactAffiliation"("companyId");

ALTER TABLE "ContactAffiliation" ADD CONSTRAINT "ContactAffiliation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactAffiliation" ADD CONSTRAINT "ContactAffiliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: CrmCompanyLink
CREATE TABLE IF NOT EXISTS "CrmCompanyLink" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "companyId" UUID,
    "provider" "CrmProviderType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalType" "CrmRecordType" NOT NULL,
    "domain" TEXT,
    "matchConfidence" TEXT NOT NULL DEFAULT 'domain_exact',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCompanyLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmCompanyLink_connectionId_externalType_externalId_key" ON "CrmCompanyLink"("connectionId", "externalType", "externalId");
CREATE INDEX IF NOT EXISTS "CrmCompanyLink_companyId_idx" ON "CrmCompanyLink"("companyId");
CREATE INDEX IF NOT EXISTS "CrmCompanyLink_connectionId_domain_idx" ON "CrmCompanyLink"("connectionId", "domain");

ALTER TABLE "CrmCompanyLink" ADD CONSTRAINT "CrmCompanyLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CrmConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCompanyLink" ADD CONSTRAINT "CrmCompanyLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
