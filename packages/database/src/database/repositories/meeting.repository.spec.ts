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
  agentId: randomUUID(),
  callId: randomUUID(),
  agentCallId: randomUUID(),
  calendarId: randomUUID(),
  personalCalendarId: randomUUID(),
  secondCalendarId: randomUUID(),
};

const GLOBAL_SCOPE = { calendarId: fixture.calendarId, isDefault: true };
const PERSONAL_SCOPE = {
  calendarId: fixture.personalCalendarId,
  isDefault: true,
};
const SECOND_SCOPE = { calendarId: fixture.secondCalendarId, isDefault: false };

let databaseConnected = false;
let databaseReady = false;

async function cleanupFixtures() {
  await prisma.meeting.deleteMany({ where: { userId: fixture.userId } });
  await prisma.calendarAvailabilityRule.deleteMany({
    where: { userId: fixture.userId },
  });
  await prisma.aiVoiceAgentCall.deleteMany({
    where: { userId: fixture.userId },
  });
  await prisma.call.deleteMany({ where: { userId: fixture.userId } });
  await prisma.aiVoiceAgent.deleteMany({ where: { userId: fixture.userId } });
  await prisma.calendar.deleteMany({ where: { userId: fixture.userId } });
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
  await prisma.calendar.createMany({
    data: [
      {
        id: fixture.calendarId,
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        name: "Global calendar",
        isDefault: true,
      },
      {
        id: fixture.personalCalendarId,
        userId: fixture.userId,
        organizationId: null,
        name: "Global calendar",
        isDefault: true,
      },
      {
        id: fixture.secondCalendarId,
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        name: "Second calendar",
        isDefault: false,
      },
    ],
  });
  await prisma.aiVoiceAgent.create({
    data: {
      id: fixture.agentId,
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      name: "Meeting test agent",
      type: "appointment_booking",
    },
  });
  await prisma.call.create({
    data: {
      id: fixture.callId,
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      fromNumber: "+12025550100",
      toNumber: "+12025550101",
      source: "ai_voice_agent",
    },
  });
  await prisma.aiVoiceAgentCall.create({
    data: {
      id: fixture.agentCallId,
      agentId: fixture.agentId,
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      callId: fixture.callId,
      fromNumber: "+12025550100",
      toNumber: "+12025550101",
    },
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
      calendarId: fixture.calendarId,
    };
    const scope = GLOBAL_SCOPE;

    const results = await Promise.all([
      repository.createIfAvailable(ctx, data, scope, null),
      repository.createIfAvailable(ctx, data, scope, null),
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
      calendarId: fixture.personalCalendarId,
    };
    const scope = PERSONAL_SCOPE;

    const results = await Promise.all([
      repository.createIfAvailable(ctx, data, scope, null),
      repository.createIfAvailable(ctx, data, scope, null),
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

  it("allows concurrent bookings up to the configured capacity", async (t) => {
    if (!requireDatabase(t)) return;

    const ctx = {
      userId: fixture.userId,
      organizationId: fixture.organizationId,
    };
    const data = {
      contactId: fixture.organizationContactId,
      scheduledAt: new Date("2099-01-07T15:00:00.000Z"),
      duration: 30,
      calendarId: fixture.calendarId,
    };
    await prisma.calendarAvailabilityRule.deleteMany({
      where: { userId: fixture.userId },
    });
    const rule = await prisma.calendarAvailabilityRule.create({
      data: {
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        calendarId: fixture.calendarId,
        daysOfWeek: [3],
        startMinute: 15 * 60,
        endMinute: 16 * 60,
        capacity: 2,
      },
    });

    const results = await Promise.all([
      repository.createIfAvailable(ctx, data, GLOBAL_SCOPE, rule.id),
      repository.createIfAvailable(ctx, data, GLOBAL_SCOPE, rule.id),
      repository.createIfAvailable(ctx, data, GLOBAL_SCOPE, rule.id),
    ]);

    assert.equal(results.filter(Boolean).length, 2);
    assert.equal(results.filter((meeting) => meeting === null).length, 1);
  });

  it("accepts simultaneous bookings when capacity is unlimited", async (t) => {
    if (!requireDatabase(t)) return;

    const ctx = {
      userId: fixture.userId,
      organizationId: fixture.organizationId,
    };
    const data = {
      contactId: fixture.organizationContactId,
      scheduledAt: new Date("2099-01-08T15:00:00.000Z"),
      duration: 30,
      calendarId: fixture.calendarId,
    };
    await prisma.calendarAvailabilityRule.deleteMany({
      where: { userId: fixture.userId },
    });
    const rule = await prisma.calendarAvailabilityRule.create({
      data: {
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        calendarId: fixture.calendarId,
        daysOfWeek: [4],
        startMinute: 15 * 60,
        endMinute: 16 * 60,
        capacity: null,
      },
    });

    const results = await Promise.all([
      repository.createIfAvailable(ctx, data, GLOBAL_SCOPE, rule.id),
      repository.createIfAvailable(ctx, data, GLOBAL_SCOPE, rule.id),
      repository.createIfAvailable(ctx, data, GLOBAL_SCOPE, rule.id),
    ]);

    assert.equal(results.filter(Boolean).length, 3);
  });

  it("claims one voice-agent call atomically even with unlimited capacity", async (t) => {
    if (!requireDatabase(t)) return;

    const ctx = {
      userId: fixture.userId,
      organizationId: fixture.organizationId,
    };
    const data = {
      contactId: fixture.organizationContactId,
      callId: fixture.callId,
      agentCallId: fixture.agentCallId,
      scheduledAt: new Date("2099-01-09T15:00:00.000Z"),
      duration: 30,
      calendarId: fixture.calendarId,
    };
    await prisma.calendarAvailabilityRule.deleteMany({
      where: { userId: fixture.userId },
    });
    const rule = await prisma.calendarAvailabilityRule.create({
      data: {
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        calendarId: fixture.calendarId,
        daysOfWeek: [5],
        startMinute: 15 * 60,
        endMinute: 16 * 60,
        capacity: null,
      },
    });

    const results = await Promise.all([
      repository.createIfAvailable(ctx, data, GLOBAL_SCOPE, rule.id),
      repository.createIfAvailable(ctx, data, GLOBAL_SCOPE, rule.id),
    ]);

    assertExactlyOneBooking(results);
    const claimed = await prisma.aiVoiceAgentCall.findUnique({
      where: { id: fixture.agentCallId },
    });
    assert.equal(claimed?.meetingId, results.find(Boolean)?.id);
  });

  it("revalidates the current rule capacity under the booking lock", async (t) => {
    if (!requireDatabase(t)) return;

    const ctx = {
      userId: fixture.userId,
      organizationId: fixture.organizationId,
    };
    const data = {
      contactId: fixture.organizationContactId,
      scheduledAt: new Date("2099-01-10T15:00:00.000Z"),
      duration: 30,
      calendarId: fixture.calendarId,
    };
    await prisma.calendarAvailabilityRule.deleteMany({
      where: { userId: fixture.userId },
    });
    const rule = await prisma.calendarAvailabilityRule.create({
      data: {
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        calendarId: fixture.calendarId,
        daysOfWeek: [6],
        startMinute: 15 * 60,
        endMinute: 16 * 60,
        capacity: 3,
      },
    });
    await prisma.calendarAvailabilityRule.update({
      where: { id: rule.id },
      data: { capacity: 1 },
    });

    const results = await Promise.all([
      repository.createIfAvailable(ctx, data, GLOBAL_SCOPE, rule.id),
      repository.createIfAvailable(ctx, data, GLOBAL_SCOPE, rule.id),
    ]);

    assertExactlyOneBooking(results);
  });

  it("keeps capacity independent between two calendars", async (t) => {
    if (!requireDatabase(t)) return;

    const ctx = {
      userId: fixture.userId,
      organizationId: fixture.organizationId,
    };
    const scheduledAt = new Date("2099-01-11T15:00:00.000Z");
    await prisma.calendarAvailabilityRule.deleteMany({
      where: { userId: fixture.userId },
    });
    const [globalRule, secondRule] = await Promise.all([
      prisma.calendarAvailabilityRule.create({
        data: {
          userId: fixture.userId,
          organizationId: fixture.organizationId,
          calendarId: fixture.calendarId,
          daysOfWeek: [0],
          startMinute: 15 * 60,
          endMinute: 16 * 60,
          capacity: 1,
        },
      }),
      prisma.calendarAvailabilityRule.create({
        data: {
          userId: fixture.userId,
          organizationId: fixture.organizationId,
          calendarId: fixture.secondCalendarId,
          daysOfWeek: [0],
          startMinute: 15 * 60,
          endMinute: 16 * 60,
          capacity: 1,
        },
      }),
    ]);

    // Both calendars allow one booking at this time. Filling one must leave the
    // other's slot open — a booking never consumes another calendar's capacity.
    const first = await repository.createIfAvailable(
      ctx,
      {
        contactId: fixture.organizationContactId,
        scheduledAt,
        duration: 30,
        calendarId: fixture.calendarId,
      },
      GLOBAL_SCOPE,
      globalRule.id,
    );
    const other = await repository.createIfAvailable(
      ctx,
      {
        contactId: fixture.organizationContactId,
        scheduledAt,
        duration: 30,
        calendarId: fixture.secondCalendarId,
      },
      SECOND_SCOPE,
      secondRule.id,
    );
    const overflow = await repository.createIfAvailable(
      ctx,
      {
        contactId: fixture.organizationContactId,
        scheduledAt,
        duration: 30,
        calendarId: fixture.calendarId,
      },
      GLOBAL_SCOPE,
      globalRule.id,
    );

    assert.ok(first);
    assert.ok(other);
    assert.equal(overflow, null);
  });

  it("does not see another calendar's meetings as busy", async (t) => {
    if (!requireDatabase(t)) return;

    const ctx = {
      userId: fixture.userId,
      organizationId: fixture.organizationId,
    };
    const start = new Date("2099-01-12T15:00:00.000Z");
    const end = new Date("2099-01-12T16:00:00.000Z");
    await prisma.meeting.create({
      data: {
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        contactId: fixture.organizationContactId,
        calendarId: fixture.secondCalendarId,
        scheduledAt: start,
        duration: 30,
      },
    });

    const onSecond = await repository.findBusySlots(
      ctx,
      SECOND_SCOPE,
      start,
      end,
    );
    const onGlobal = await repository.findBusySlots(
      ctx,
      GLOBAL_SCOPE,
      start,
      end,
    );

    assert.equal(onSecond.length, 1);
    assert.equal(onGlobal.length, 0);
  });
});
