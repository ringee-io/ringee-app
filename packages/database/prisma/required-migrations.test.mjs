import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  REQUIRED_MIGRATIONS,
  REQUIRED_COLUMNS,
  stageRequiredMigrations,
} from "./required-migrations.mjs";
import { verifyRequiredMigrations } from "./verify-required-migrations.mjs";

test("stages the complete required release set from the tracked migration sources", async () => {
  const destination = await mkdtemp(join(tmpdir(), "ringee-migrations-"));
  const source = dirname(fileURLToPath(import.meta.url));
  try {
    await stageRequiredMigrations(source, destination);
    for (const name of REQUIRED_MIGRATIONS)
      assert.equal(
        await readFile(
          join(destination, "migrations", name, "migration.sql"),
          "utf8",
        ),
        await readFile(
          join(source, "migrations-pending", name, "migration.sql"),
          "utf8",
        ),
      );
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});

const socket = process.env.RINGEE_DIALER_TEST_PG_SOCKET;
test(
  "refuses rollout for any missing migration, required column or callback unique key",
  { skip: !socket },
  async () => {
    assert.ok(socket.startsWith("/private/tmp/") || socket.startsWith("/tmp/"));
    const schema = `migration_gate_${randomUUID().replaceAll("-", "")}`;
    const url = `postgresql://${userInfo().username}@localhost:55445/postgres?host=${encodeURIComponent(socket)}&schema=${schema}`;
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await prisma.$executeRawUnsafe(
        'CREATE TABLE "_prisma_migrations" (migration_name text PRIMARY KEY, finished_at timestamp, rolled_back_at timestamp)',
      );
      for (const table of new Set(REQUIRED_COLUMNS.map(([table]) => table)))
        await prisma.$executeRawUnsafe(
          `CREATE TABLE "${table}" (id uuid PRIMARY KEY)`,
        );
      for (const [table, column, type] of REQUIRED_COLUMNS) {
        if (["eventStreamId", "creationKey"].includes(column)) continue;
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${table}" ADD COLUMN "${column}" ${type === "timestamp without time zone" ? "timestamp(3)" : type}`,
        );
      }
      const migration = await readFile(
        join(
          dirname(fileURLToPath(import.meta.url)),
          "migrations-pending/20261123120000_dialer_stream_callback_fences/migration.sql",
        ),
        "utf8",
      );
      for (const statement of migration
        .split(";")
        .filter((value) => value.trim()))
        await prisma.$executeRawUnsafe(statement);
      for (const name of REQUIRED_MIGRATIONS)
        await prisma.$executeRaw`INSERT INTO "_prisma_migrations" (migration_name, finished_at) VALUES (${name}, now())`;
      await verifyRequiredMigrations(prisma);
      for (const name of REQUIRED_MIGRATIONS) {
        await prisma.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = NULL WHERE migration_name = ${name}`;
        await assert.rejects(
          verifyRequiredMigrations(prisma),
          /Required migration/,
        );
        await prisma.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = now(), rolled_back_at = now() WHERE migration_name = ${name}`;
        await assert.rejects(
          verifyRequiredMigrations(prisma),
          /Required migration/,
        );
        await prisma.$executeRaw`UPDATE "_prisma_migrations" SET rolled_back_at = NULL WHERE migration_name = ${name}`;
      }
      for (const [table, column] of REQUIRED_COLUMNS) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${table}" RENAME COLUMN "${column}" TO "missing_column"`,
        );
        await assert.rejects(
          verifyRequiredMigrations(prisma),
          /Required column/,
        );
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${table}" RENAME COLUMN "missing_column" TO "${column}"`,
        );
      }
      await prisma.$executeRawUnsafe(
        'DROP INDEX "CallbackTask_creationKey_key"',
      );
      await prisma.$executeRawUnsafe(
        'CREATE UNIQUE INDEX wrong_callback_key ON "CallbackTask" (id) INCLUDE ("creationKey")',
      );
      await assert.rejects(
        verifyRequiredMigrations(prisma),
        /creation key uniqueness/,
      );
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
      await prisma.$disconnect();
    }
  },
);
