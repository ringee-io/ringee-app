-- Move this file to:
-- prisma/migrations/20260724000000_add_gohighlevel_crm/migration.sql
--
-- HubSpot already exists in the original enum. Add GoHighLevel as a
-- first-class CRM provider for OAuth connections and sync records.
ALTER TYPE "CrmProviderType" ADD VALUE IF NOT EXISTS 'gohighlevel';
