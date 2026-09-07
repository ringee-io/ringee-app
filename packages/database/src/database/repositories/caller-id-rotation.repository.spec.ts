/// <reference types="node" />
import assert from "node:assert/strict";
import { userInfo } from "node:os";
import { PrismaClient } from "@prisma/client";
import { describe, it } from "node:test";
import { CallerIdRotationRepository } from "./caller-id-rotation.repository";

const ctx = { userId: "user-1", organizationId: null };

describe("rotation persistence", () => {
  it("scopes both the pool and the current number owner; excludes deleted numbers", async () => {
    const queries: Array<{ where: Record<string, unknown> }> = [];
    const repo = new CallerIdRotationRepository({
      callerIdPoolMember: {
        findMany: async (query: { where: Record<string, unknown> }) => {
          queries.push(query);
          return [];
        },
      },
    } as never);
    await repo.listPoolMembers(ctx);
    await repo.findEligibleMembers(ctx);
    for (const { where } of queries) {
      assert.equal(where.userId, ctx.userId);
      assert.equal(where.organizationId, null);
      assert.deepEqual(where.number, {
        userId: ctx.userId,
        organizationId: null,
        deletedAt: null,
        ...(Object.prototype.hasOwnProperty.call(where, "participating")
          ? { isoCountry: undefined }
          : {}),
      });
    }
    assert.equal(queries[1].where.participating, true);
    assert.equal(queries[1].where.rotationStatus, "active");
  });
  it("materializes missing members with an upsert so concurrent dialers cannot fail a unique key", async () => {
    const queries: Array<{ where: unknown; update: unknown }> = [];
    const repo = new CallerIdRotationRepository({
      callerIdPoolMember: {
        upsert: async (query: { where: unknown; update: unknown }) => {
          queries.push(query);
          return {};
        },
      },
    } as never);
    await repo.createPoolMember(ctx, "number-1");
    assert.deepEqual(queries[0].where, { numberId: "number-1" });
    assert.deepEqual(queries[0].update, { numberId: "number-1" });
  });
  it("claims only the active participating row whose last-used timestamp was ranked", async () => {
    const previous = new Date();
    const queries: Array<{
      where: Record<string, unknown>;
      data: { lastUsedAt: Date };
    }> = [];
    const repo = new CallerIdRotationRepository({
      callerIdPoolMember: {
        updateMany: async (q: (typeof queries)[number]) => {
          queries.push(q);
          return { count: 0 };
        },
      },
    } as never);
    assert.equal(await repo.markUsed("number-1", previous), false);
    assert.deepEqual(queries[0].where, {
      numberId: "number-1",
      lastUsedAt: previous,
      participating: true,
      rotationStatus: "active",
    });
    assert.ok(queries[0].data.lastUsedAt > previous);
  });
});

/** Optional real SQL regression test; uses only temporary tables on a local socket. */
const socket = process.env.RINGEE_ROTATION_TEST_PG_SOCKET;
it(
  "counts persisted calls once, on their start day, with workspace isolation (PostgreSQL)",
  { skip: !socket },
  async () => {
    assert.ok(
      socket!.startsWith("/tmp/"),
      "Use an isolated temporary local PostgreSQL socket",
    );
    const prisma = new PrismaClient({
      datasourceUrl: `postgresql://${userInfo().username}@localhost:55439/postgres?host=${encodeURIComponent(socket!)}`,
    });
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            `CREATE TEMP TABLE "NumberPurchased" (id uuid PRIMARY KEY, "phoneNumber" text, "userId" uuid, "organizationId" uuid)`,
          );
          await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Call" (id text PRIMARY KEY, "fromNumber" text, "userId" uuid, "organizationId" uuid,
          direction text, "callControlId" text, "startedAt" timestamp, "createdAt" timestamp, "answeredAt" timestamp, "endedAt" timestamp)`);
          const numberId = "00000000-0000-0000-0000-000000000001";
          const personalId = "00000000-0000-0000-0000-000000000002";
          const org = "00000000-0000-0000-0000-000000000003";
          const user = "00000000-0000-0000-0000-000000000004";
          const otherOrg = "00000000-0000-0000-0000-000000000005";
          await tx.$executeRaw`INSERT INTO "NumberPurchased" VALUES
        (${numberId}::uuid, ${"+12125550101"}, ${user}::uuid, ${org}::uuid),
        (${personalId}::uuid, ${"+14155550101"}, ${user}::uuid, NULL)`;
          const insert = async (
            id: string,
            phone: string,
            scope: string | null,
            started: string,
            answered: string | null = null,
            ended: string | null = null,
            direction = "outbound",
            control: string | null = id,
          ) => {
            await tx.$executeRaw`INSERT INTO "Call" VALUES (
          ${id}, ${phone}, ${user}::uuid, ${scope}::uuid, ${direction}, ${control},
          ${started}::timestamp, ${started}::timestamp, ${answered}::timestamp, ${ended}::timestamp)
          ON CONFLICT (id) DO UPDATE SET "answeredAt" = EXCLUDED."answeredAt", "endedAt" = EXCLUDED."endedAt"`;
          };
          await insert(
            "midnight",
            "+12125550101",
            org,
            "2026-09-06T23:59:58Z",
            "2026-09-07T00:00:01Z",
            "2026-09-07T00:00:03Z",
          );
          await insert(
            "midnight",
            "+12125550101",
            org,
            "2026-09-06T23:59:58Z",
            "2026-09-07T00:00:01Z",
            "2026-09-07T00:00:03Z",
          );
          await insert("next-day", "+12125550101", org, "2026-09-07T12:00:00Z");
          await insert(
            "foreign",
            "+12125550101",
            otherOrg,
            "2026-09-06T12:00:00Z",
          );
          await insert(
            "personal-same-user",
            "+12125550101",
            null,
            "2026-09-06T12:00:00Z",
          );
          await insert(
            "inbound",
            "+12125550101",
            org,
            "2026-09-06T12:00:00Z",
            null,
            null,
            "inbound",
          );
          await insert(
            "pending-sdk",
            "+12125550101",
            org,
            "2026-09-06T12:00:00Z",
            null,
            null,
            "outbound",
            null,
          );
          await insert(
            "personal",
            "+14155550101",
            null,
            "2026-09-06T12:00:00Z",
          );
          await insert(
            "org-same-user",
            "+14155550101",
            org,
            "2026-09-06T12:00:00Z",
          );
          const repo = new CallerIdRotationRepository(tx as never);
          const day = new Date("2026-09-06T00:00:00Z");
          const usage = await repo.usageForNumbers([numberId, personalId], day);
          assert.deepEqual(usage.get(numberId), {
            numberId,
            count: 1,
            answered: 1,
            shortCalls: 1,
          });
          assert.deepEqual(usage.get(personalId), {
            numberId: personalId,
            count: 1,
            answered: 0,
            shortCalls: 0,
          });
          assert.equal((await repo.usageSince(numberId, day)).count, 2);
          assert.deepEqual(
            (
              await repo.usageForNumbers(
                [numberId],
                new Date("2026-09-07T00:00:00Z"),
              )
            ).get(numberId),
            { numberId, count: 1, answered: 0, shortCalls: 0 },
          );
          assert.equal((await repo.usageForNumbers([], day)).size, 0);
        },
        { timeout: 15000 },
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);
