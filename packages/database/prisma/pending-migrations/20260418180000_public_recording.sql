-- Move this file to: prisma/migrations/20260418180000_public_recording/migration.sql
-- Run after: 20260415180000_crm_extension

CREATE TABLE IF NOT EXISTS "PublicRecording" (
  "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
  "callId"    UUID         NOT NULL,
  "url"       TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PublicRecording_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PublicRecording_callId_idx" ON "PublicRecording"("callId");

ALTER TABLE "PublicRecording"
  ADD CONSTRAINT "PublicRecording_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "Call"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
