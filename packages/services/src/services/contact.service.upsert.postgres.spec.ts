import {
  FOLLOW_UP_SUITE_TIMEOUT_MS,
  isolateFollowUpWorkerFixtures,
} from "../../test/postgres-worker-fixture";
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  ContactRepository,
  PrismaClient,
  TagRepository,
} from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";
import { ContactService } from "./contact.service";

/**
 * HOOK-009 on real PostgreSQL: `PUT /api/v1/contacts` is "safe to send twice".
 *
 * The unit specs stub the repository, so they cannot show what the claim
 * depends on. `Contact` has no unique index over a live number (its
 * `@@unique([userId, phoneNumber, deletedAt])` includes a nullable column, and
 * PostgreSQL treats every NULL as distinct), so "find, then create" alone lets
 * simultaneous requests each create the contact.
 *
 * Opt in with a disposable database (the same variable the follow-up suites
 * use); without it the suite is skipped.
 */
const url = process.env.RINGEE_FOLLOWUP_TEST_DATABASE_URL;

describe(
  "contact upsert on PostgreSQL (HOOK-009)",
  { skip: !url, timeout: FOLLOW_UP_SUITE_TIMEOUT_MS },
  () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const db = prisma as never;
    const service = new ContactService(
      new ContactRepository(db),
      new TagRepository(db),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const userId = randomUUID();
    const otherUserId = randomUUID();
    const organizationId = randomUUID();
    const org: OwnershipContext = { userId, organizationId };
    const personal: OwnershipContext = { userId, organizationId: null };
    const otherPersonal: OwnershipContext = {
      userId: otherUserId,
      organizationId: null,
    };
    let releaseFixture: (() => Promise<void>) | undefined;

    const phone = () =>
      `+1202${Math.floor(Math.random() * 1e7)
        .toString()
        .padStart(7, "0")}`;
    const live = (owner: OwnershipContext, phoneNumber: string) =>
      prisma.contact.count({
        where: {
          userId: owner.userId,
          organizationId: owner.organizationId,
          phoneNumber,
          deletedAt: null,
        },
      });

    before(async () => {
      assert.ok(["127.0.0.1", "localhost"].includes(new URL(url!).hostname));
      releaseFixture = await isolateFollowUpWorkerFixtures(prisma);
      await prisma.user.createMany({
        data: [
          { id: userId, canCall: true },
          { id: otherUserId, canCall: true },
        ],
      });
      await prisma.organization.create({
        data: { id: organizationId, clerkId: organizationId, name: "Team" },
      });
    });

    after(async () => {
      try {
        const users = { in: [userId, otherUserId] };
        await prisma.contact.deleteMany({ where: { userId: users } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
        await prisma.user.deleteMany({ where: { id: users } });
      } finally {
        await releaseFixture?.();
        await prisma.$disconnect();
      }
    });

    it("settles simultaneous upserts of a new number on one contact", async () => {
      const number = phone();
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          service.upsertContact(org, {
            phoneNumber: number,
            firstName: `Ada${i}`,
          }),
        ),
      );

      assert.equal(await live(org, number), 1, "exactly one live contact");
      assert.equal(results.filter((r) => r.created).length, 1, "one creator");
      assert.equal(new Set(results.map((r) => r.contact.id)).size, 1);
    });

    it("keeps the same number in two workspaces apart", async () => {
      const number = phone();
      await Promise.all([
        service.upsertContact(org, { phoneNumber: number }),
        service.upsertContact(personal, { phoneNumber: number }),
        service.upsertContact(otherPersonal, { phoneNumber: number }),
        service.upsertContact(org, { phoneNumber: number }),
        service.upsertContact(personal, { phoneNumber: number }),
      ]);

      assert.equal(await live(org, number), 1);
      assert.equal(await live(personal, number), 1);
      assert.equal(await live(otherPersonal, number), 1);
    });

    it("never writes a blank over what is stored, even when racing", async () => {
      const number = phone();
      await service.upsertContact(org, {
        phoneNumber: number,
        firstName: "Grace",
        email: "grace@example.com",
      });
      await Promise.all(
        Array.from({ length: 6 }, () =>
          service.upsertContact(org, {
            phoneNumber: number,
            firstName: "",
            email: "  ",
            jobTitle: "Admiral",
          }),
        ),
      );

      const stored = await prisma.contact.findFirstOrThrow({
        where: { userId, organizationId, phoneNumber: number, deletedAt: null },
      });
      assert.equal(stored.firstName, "Grace");
      assert.equal(stored.email, "grace@example.com");
      assert.equal(stored.jobTitle, "Admiral");
    });
  },
);
