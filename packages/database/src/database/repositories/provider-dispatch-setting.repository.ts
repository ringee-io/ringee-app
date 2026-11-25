import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

/**
 * An administrator's overrides of the outbound pacing limits (CPS-010). One row
 * per provider billing account and setting. Validation belongs to the service:
 * this only stores what it is given.
 */
@Injectable()
export class ProviderDispatchSettingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForAccount(
    providerAccountKey: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.prisma.providerDispatchSetting.findMany({
      where: { providerAccountKey },
    });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async upsertMany(
    providerAccountKey: string,
    values: Record<string, unknown>,
    by: { userId: string | null; reason: string | null },
  ): Promise<void> {
    await this.prisma.$transaction(
      Object.entries(values).map(([key, value]) =>
        this.prisma.providerDispatchSetting.upsert({
          where: { providerAccountKey_key: { providerAccountKey, key } },
          create: {
            providerAccountKey,
            key,
            value: value as Prisma.InputJsonValue,
            updatedByUserId: by.userId,
            reason: by.reason,
          },
          update: {
            value: value as Prisma.InputJsonValue,
            updatedByUserId: by.userId,
            reason: by.reason,
          },
        }),
      ),
    );
  }

  /**
   * Changes one account's overrides as a single decision. `decide` is given
   * what is stored right now — read under the account's own lock, so two
   * changes cannot each judge a value the other is replacing — and returns what
   * to write and what to remove, or throws to change nothing. Nothing is
   * written until it has decided.
   */
  async change(
    providerAccountKey: string,
    decide: (stored: Record<string, unknown>) => {
      upsert?: Record<string, unknown>;
      remove?: string[];
    },
    by: { userId: string | null; reason: string | null },
  ): Promise<{ removed: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`provider-dispatch-settings:${providerAccountKey}`}, 0))`;
      const rows = await tx.providerDispatchSetting.findMany({
        where: { providerAccountKey },
      });
      const plan = decide(
        Object.fromEntries(rows.map((row) => [row.key, row.value])),
      );
      for (const [key, value] of Object.entries(plan.upsert ?? {})) {
        await tx.providerDispatchSetting.upsert({
          where: { providerAccountKey_key: { providerAccountKey, key } },
          create: {
            providerAccountKey,
            key,
            value: value as Prisma.InputJsonValue,
            updatedByUserId: by.userId,
            reason: by.reason,
          },
          update: {
            value: value as Prisma.InputJsonValue,
            updatedByUserId: by.userId,
            reason: by.reason,
          },
        });
      }
      const removed = plan.remove?.length
        ? await tx.providerDispatchSetting.deleteMany({
            where: { providerAccountKey, key: { in: plan.remove } },
          })
        : { count: 0 };
      return { removed: removed.count };
    });
  }

  /** Removes overrides, so those settings fall back to the environment. */
  async deleteKeys(
    providerAccountKey: string,
    keys: string[],
  ): Promise<number> {
    if (keys.length === 0) return 0;
    const removed = await this.prisma.providerDispatchSetting.deleteMany({
      where: { providerAccountKey, key: { in: keys } },
    });
    return removed.count;
  }
}
