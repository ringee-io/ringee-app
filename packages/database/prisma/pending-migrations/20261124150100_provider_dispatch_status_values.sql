-- Companion of migrations-pending/20261124150000_provider_dispatch.
--
-- Apply the schema migration first. Then RUN BY HAND with psql, one statement
-- at a time, with autocommit enabled: no BEGIN, --single-transaction or Prisma
-- migration runner. (PostgreSQL 12+ accepts ADD VALUE inside a transaction, but
-- the new value cannot be used until it commits, so a script that adds and uses
-- it together fails; keeping it separate avoids the question.)
--
-- Run it before setting DISPATCH_QUEUE_ENABLED=true. The values are additive:
-- every existing row keeps its status, and an API or worker that does not know
-- them never meets them, because only the queue writes them.
--
--   queued     waiting for provider capacity; nothing has been dialed
--   cancelled  withdrawn by its caller before it was dialed
--   expired    waited past its limit and was never dialed

ALTER TYPE "AiVoiceAgentCallStatus" ADD VALUE IF NOT EXISTS 'queued';

ALTER TYPE "AiVoiceAgentCallStatus" ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TYPE "AiVoiceAgentCallStatus" ADD VALUE IF NOT EXISTS 'expired';

-- Check:
--
--   SELECT enumlabel FROM pg_enum
--    WHERE enumtypid = '"AiVoiceAgentCallStatus"'::regtype
--    ORDER BY enumsortorder;
