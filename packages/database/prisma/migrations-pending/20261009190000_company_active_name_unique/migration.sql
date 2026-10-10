-- Active companies are unique by name within a workspace.
--
-- `CompanyRepository.upsertActiveByName` — the contacts CSV import, and so a
-- list created from a CSV — resolves a company with
--   INSERT … ON CONFLICT ("organizationId" | "userId", "normalizedName") WHERE …
-- and `isActiveNameConflict` (the CRM company sync) reads the same uniqueness
-- back as a P2002. `normalizedName` shipped with that code on 2026-09-03, but
-- its migration (`20260903000000_company_normalized_name`) was left empty, so
-- the unique indexes those statements rely on never existed and every import of
-- a file with a company LinkedIn column failed with 42P10, "there is no unique
-- or exclusion constraint matching the ON CONFLICT specification".
--
-- Written to run whether or not a database already has the column:
-- 1. add `normalizedName` where it is missing;
-- 2. give every active company its normalized name the way
--    `normalizeCompanyName` does (trimmed, inner whitespace collapsed,
--    lower-cased). A name a workspace holds more than once stays with one
--    company — the one that already carries it, else the oldest — and the
--    others keep none: nothing is merged or deleted;
-- 3. create the two partial unique indexes, matching the ON CONFLICT targets
--    exactly: organization companies by ("organizationId", "normalizedName"),
--    personal ones by ("userId", "normalizedName"), active rows only.
--
-- Prisma cannot express a WHERE on @@unique, so these indexes live only here,
-- as DNCEntry's do; the schema says so on the column. `updatedAt` is left
-- alone: the companies list is ordered by it.

-- 1. Column
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "normalizedName" TEXT;

-- 2. Backfill, one company per name and workspace
WITH "active" AS (
    SELECT
        c."id",
        COALESCE(c."organizationId"::text, 'user:' || c."userId"::text) AS "workspace",
        COALESCE(
            c."normalizedName",
            lower(regexp_replace(regexp_replace(c."name", '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g'))
        ) AS "wanted",
        c."normalizedName" IS NOT NULL AS "named",
        c."createdAt"
    FROM "Company" c
    WHERE c."deletedAt" IS NULL
),
"ranked" AS (
    SELECT
        a."id",
        CASE
            WHEN a."wanted" <> '' AND row_number() OVER (
                PARTITION BY a."workspace", a."wanted"
                ORDER BY a."named" DESC, a."createdAt", a."id"
            ) = 1 THEN a."wanted"
        END AS "normalizedName"
    FROM "active" a
)
UPDATE "Company" c
SET "normalizedName" = r."normalizedName"
FROM "ranked" r
WHERE c."id" = r."id"
  AND c."normalizedName" IS DISTINCT FROM r."normalizedName";

-- 3. One active company per name: in an organization, and in a personal workspace
CREATE UNIQUE INDEX IF NOT EXISTS "Company_organizationId_normalizedName_active_key"
    ON "Company" ("organizationId", "normalizedName")
    WHERE "deletedAt" IS NULL AND "organizationId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Company_userId_normalizedName_active_key"
    ON "Company" ("userId", "normalizedName")
    WHERE "deletedAt" IS NULL AND "organizationId" IS NULL;
