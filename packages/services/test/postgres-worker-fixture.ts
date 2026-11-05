import type { PrismaClient } from "@ringee/database";

// Both describe blocks enforce this bound, including fixture acquisition.
export const FOLLOW_UP_SUITE_TIMEOUT_MS = 10 * 60_000;

/** Worker claims intentionally span workspaces. Serialize suites sharing a
 * disposable database, while keeping each suite's competing workers concurrent.
 * A transaction-scoped lock also releases if a test process dies. */
export async function isolateFollowUpWorkerFixtures(prisma: PrismaClient) {
  let release!: () => void;
  let acquired!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const transaction = prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(521143, 2)`;
      acquired();
      await hold;
    },
    { maxWait: 30_000, timeout: 2 * FOLLOW_UP_SUITE_TIMEOUT_MS + 60_000 },
  );
  await Promise.race([ready, transaction]);
  return async () => {
    release();
    await transaction;
  };
}
