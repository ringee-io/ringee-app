import { PrismaClient } from "@prisma/client";
import {
  REQUIRED_MIGRATIONS,
  REQUIRED_COLUMNS,
} from "./required-migrations.mjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function verifyRequiredMigrations(prisma) {
  for (const migration of REQUIRED_MIGRATIONS) {
    const [state] = await prisma.$queryRaw`
      SELECT EXISTS (
      SELECT 1 FROM "_prisma_migrations"
      WHERE migration_name = ${migration}
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      ) AS applied`;
    if (!state?.applied)
      throw new Error(
        `Required migration ${migration} is not applied; refusing service rollout`,
      );
  }
  for (const [table, column, type] of REQUIRED_COLUMNS) {
    const [state] = await prisma.$queryRaw`
      SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${table}
        AND column_name = ${column} AND data_type = ${type}
        AND (${type} <> 'timestamp without time zone' OR datetime_precision = 3)
        AND is_nullable = 'YES'
      ) AS available`;
    if (!state?.available)
      throw new Error(
        `Required column ${table}.${column} is unavailable; refusing service rollout`,
      );
  }
  const [index] = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
      WHERE n.nspname = current_schema() AND t.relname = 'CallbackTask'
        AND a.attname = 'creationKey' AND i.indisunique AND i.indisvalid
        AND i.indnkeyatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
    ) AS available`;
  if (!index?.available)
    throw new Error(
      "Required callback creation key uniqueness is unavailable; refusing service rollout",
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const prisma = new PrismaClient();
  try {
    await verifyRequiredMigrations(prisma);
    console.log("Required dialer migrations and columns verified");
  } finally {
    await prisma.$disconnect();
  }
}
