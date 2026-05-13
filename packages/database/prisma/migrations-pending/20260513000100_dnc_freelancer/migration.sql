-- DNCEntry: freelancer support
-- Allows DNC entries to belong either to an organization (shared across the org)
-- or to a single user (personal/freelancer scope). The validation rule lives in
-- ComplianceService: the active call context decides which list to check —
-- the two scopes are never mixed implicitly.

-- 1. Add userId (nullable for backfill)
ALTER TABLE "DNCEntry" ADD COLUMN "userId" UUID;

-- 2. Backfill userId from addedByUserId where available; for rows missing both
--    we fall back to the organization's creator. This is a best-effort backfill
--    so the column can be marked NOT NULL — every legacy DNC row has an org.
UPDATE "DNCEntry" d
SET "userId" = COALESCE(
  d."addedByUserId",
  (SELECT om."userId"
     FROM "OrganizationMembership" om
    WHERE om."organizationId" = d."organizationId"
      AND om."userId" IS NOT NULL
    ORDER BY om."createdAt" ASC
    LIMIT 1)
)
WHERE d."userId" IS NULL;

-- Any row still null after backfill (no addedBy, no org member) cannot exist in
-- a valid state. Delete defensively.
DELETE FROM "DNCEntry" WHERE "userId" IS NULL;

-- 3. Enforce NOT NULL on userId
ALTER TABLE "DNCEntry" ALTER COLUMN "userId" SET NOT NULL;

-- 4. organizationId becomes nullable to allow personal DNC entries
ALTER TABLE "DNCEntry" ALTER COLUMN "organizationId" DROP NOT NULL;

-- 5. Drop the old org-scoped unique constraint
ALTER TABLE "DNCEntry" DROP CONSTRAINT IF EXISTS "DNCEntry_organizationId_phoneNumber_key";
DROP INDEX IF EXISTS "DNCEntry_organizationId_phoneNumber_key";

-- 6. Re-create uniqueness as partial indexes:
--    organization DNC: dedupe within the org
CREATE UNIQUE INDEX "DNCEntry_org_phone_unique"
  ON "DNCEntry" ("organizationId", "phoneNumber")
  WHERE "organizationId" IS NOT NULL;

--    personal DNC: dedupe per user, ONLY for entries with no org
CREATE UNIQUE INDEX "DNCEntry_user_phone_unique"
  ON "DNCEntry" ("userId", "phoneNumber")
  WHERE "organizationId" IS NULL;

-- 7. FK on userId
ALTER TABLE "DNCEntry"
  ADD CONSTRAINT "DNCEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- 8. Index already declared via Prisma — add the new one for userId lookups
CREATE INDEX IF NOT EXISTS "DNCEntry_userId_idx" ON "DNCEntry"("userId");
