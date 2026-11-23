import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const [state] = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM "_prisma_migrations"
      WHERE migration_name = '20261123043000_call_attempt_reservation_identity'
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    ) AS applied, EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'CallAttempt'
        AND column_name = 'sessionReservedAt'
        AND data_type = 'timestamp without time zone'
        AND datetime_precision = 3 AND is_nullable = 'YES'
    ) AS available`;
  if (!state?.applied || !state.available)
    throw new Error(
      "Required call-attempt reservation migration is not applied; refusing service rollout",
    );
  console.log("Required call-attempt reservation migration verified");
} finally {
  await prisma.$disconnect();
}
