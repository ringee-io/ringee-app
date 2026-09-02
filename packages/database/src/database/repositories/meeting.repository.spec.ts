/// <reference types="node" />

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it, type TestContext } from "node:test";
import { PrismaClient } from "@prisma/client";
import { MeetingRepository } from "./meeting.repository";

const prisma = new PrismaClient();
const repository = new MeetingRepository(prisma as never);

const fixture = {
  userId: randomUUID(),
  organizationId: randomUUID(),
  organizationContactId: randomUUID(),
  personalContactId: randomUUID(),
};

let databaseConnected = false;
let databaseReady = false;

async function cleanupFixtures() {
  await prisma.meeting.deleteMany({ where: { userId: fixture.userId } });
  await prisma.contact.deleteMany({ where: { userId: fixture.userId } });
  await prisma.organization.deleteMany({
    where: { id: fixture.organizationId },
  });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
}

function requireDatabase(t: TestContext): boolean {
  if (databaseReady) return true;
  t.skip("PostgreSQL is unavailable or the test schema is not initialized");
  return false;
}

function assertExactlyOneBooking(
  results: Awaited<ReturnType<MeetingRepository["createIfAvailable"]>>[],
) {
  assert.equal(
    results.filter((meeting) => meeting !== null).length,
    1,
    "exactly one concurrent request should create a meeting",
  );
  assert.equal(
    results.filter((meeting) => meeting === null).length,
    1,
    "the competing request should observe the booked slot",
  );
}

before(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    databaseConnected = true;
  } catch {
    await prisma.$disconnect().catch(() => undefined);
    return;
  }

  await cleanupFixtures();
  await prisma.user.create({ data: { id: fixture.userId } });
  await prisma.organization.create({
    data: {
      id: fixture.organizationId,
      clerkId: `meeting-test-${fixture.organizationId}`,
      name: "Meeting concurrency test",
    },
  });
  await prisma.contact.createMany({
    data: [
      {
        id: fixture.organizationContactId,
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        name: "Organization booking",
        phoneNumber: "+12025550101",
      },
      {
        id: fixture.personalContactId,
        userId: fixture.userId,
        organizationId: null,
        name: "Personal booking",
        phoneNumber: "+12025550102",
      },
    ],
  });
  databaseReady = true;
});

after(async () => {
  if (databaseConnected) {
    await cleanupFixtures().catch(() => undefined);
    await prisma.$disconnect();
  }
});

describe("MeetingRepository.createIfAvailable", () => {
  it("allows exactly one concurrent organization booking", async (t) => {
    if (!requireDatabase(t)) return;

    const ctx = {
      userId: fixture.userId,
      organizationId: fixture.organizationId,
    };
    const data = {
      contactId: fixture.organizationContactId,
      scheduledAt: new Date("2099-01-05T15:00:00.000Z"),
      duration: 30,
    };

    const results = await Promise.all([
      repository.createIfAvailable(ctx, data),
      repository.createIfAvailable(ctx, data),
    ]);

    assertExactlyOneBooking(results);
    assert.equal(
      await prisma.meeting.count({
        where: {
          organizationId: fixture.organizationId,
          scheduledAt: data.scheduledAt,
        },
      }),
      1,
    );
  });

  it("allows exactly one concurrent personal booking", async (t) => {
    if (!requireDatabase(t)) return;

    const ctx = { userId: fixture.userId };
    const data = {
      contactId: fixture.personalContactId,
      scheduledAt: new Date("2099-01-06T15:00:00.000Z"),
      duration: 30,
    };

    const results = await Promise.all([
      repository.createIfAvailable(ctx, data),
      repository.createIfAvailable(ctx, data),
    ]);

    assertExactlyOneBooking(results);
    assert.equal(
      await prisma.meeting.count({
        where: {
          userId: fixture.userId,
          organizationId: null,
          scheduledAt: data.scheduledAt,
        },
      }),
      1,
    );
  });
});
