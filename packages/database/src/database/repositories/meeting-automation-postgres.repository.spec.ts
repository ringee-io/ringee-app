import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { AiVoiceAgentRepository } from "./ai-voice-agent.repository";
import { MeetingEmailDeliveryRepository } from "./meeting-email-delivery.repository";
import { MeetingReminderExecutionRepository } from "./meeting-reminder-execution.repository";

// Explicit opt-in: never inherit a developer's application DATABASE_URL.
const url = process.env.RINGEE_AUTOMATION_TEST_DATABASE_URL;

describe("Meeting automation PostgreSQL concurrency", { skip: !url }, () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const reminders = new MeetingReminderExecutionRepository(prisma as never);
  const emails = new MeetingEmailDeliveryRepository(prisma as never);
  const agents = new AiVoiceAgentRepository(prisma as never);
  const userId = randomUUID();
  const organizationId = randomUUID();
  const contactId = randomUUID();
  const agentId = randomUUID();
  const ctx = { userId, organizationId };
  const now = new Date("2026-10-14T14:00:00.000Z");
  const until = new Date(now.getTime() + 300_000);
  const expired = new Date(now.getTime() - 1);

  before(async () => {
    await prisma.user.create({ data: { id: userId } });
    await prisma.organization.create({
      data: {
        id: organizationId,
        clerkId: `automation-test-${organizationId}`,
        name: "Automation tests",
      },
    });
    await prisma.contact.create({
      data: { id: contactId, ...ctx, phoneNumber: "+12025550101" },
    });
    await prisma.aiVoiceAgent.create({
      data: {
        id: agentId,
        ...ctx,
        name: "Reminders",
        type: "reminders_notifications",
        status: "active",
      },
    });
  });

  after(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function meeting() {
    return prisma.meeting.create({
      data: {
        ...ctx,
        contactId,
        scheduledAt: new Date(now.getTime() + 3_600_000),
      },
    });
  }

  async function execution() {
    const row = await meeting();
    return prisma.meetingReminderExecution.create({
      data: {
        ...ctx,
        meetingId: row.id,
        agentId,
        trigger: "manual",
        scheduleVersion: 1,
        fireAt: now,
        idempotencyKey: randomUUID(),
      },
    });
  }

  async function delivery() {
    const row = await meeting();
    await prisma.meeting.update({
      where: { id: row.id },
      data: {
        attendanceStatus: "confirmed",
        attendanceScheduleVersion: 1,
      },
    });
    return prisma.meetingEmailDelivery.create({
      data: {
        ...ctx,
        meetingId: row.id,
        kind: "attendance_confirmed",
        scheduleVersion: 1,
        idempotencyKey: randomUUID(),
      },
    });
  }

  it("concurrent reminder workers claim disjoint rows", async () => {
    const seeded = await Promise.all(
      Array.from({ length: 4 }, () => execution()),
    );
    const batches = await Promise.all([
      reminders.claimDue(now, until, 2),
      reminders.claimDue(now, until, 2),
    ]);
    assert.equal(batches.flat().length, 4);
    assert.deepEqual(
      new Set(batches.flat().map((row) => row.id)),
      new Set(seeded.map((row) => row.id)),
    );
    assert.ok(batches.flat().every((row) => row.claimToken));
    await prisma.meetingReminderExecution.deleteMany({
      where: { id: { in: seeded.map((row) => row.id) } },
    });
  });

  it("a reclaimed reminder keeps its dial key and fences every stale mutation", async () => {
    const seed = await execution();
    const first = await reminders.claimScheduled(seed.id, until);
    assert.ok(first?.claimToken);
    const reserved = await reminders.beginDial(
      seed.id,
      first.claimToken,
      now,
      until,
    );
    assert.equal(reserved?.dialTries, 1);
    await prisma.meetingReminderExecution.update({
      where: { id: seed.id },
      data: { leaseExpiresAt: expired },
    });
    const [second] = await reminders.claimDue(now, until, 1);
    assert.notEqual(second.claimToken, first.claimToken);
    assert.equal(
      await reminders.beginDial(seed.id, first.claimToken, now, until),
      null,
    );
    assert.equal(
      await reminders.markPlaced(seed.id, randomUUID(), first.claimToken),
      false,
    );
    assert.equal(
      await reminders.defer(seed.id, now, "stale", first.claimToken, true),
      false,
    );
    assert.equal(
      await reminders.finish(
        seed.id,
        "failed",
        ["claimed"],
        undefined,
        first.claimToken,
      ),
      false,
    );
    assert.equal(
      await reminders.authorizeDial(first, now, until, until),
      false,
    );
    const recovered = await reminders.beginDial(
      seed.id,
      second.claimToken!,
      now,
      until,
    );
    assert.equal(recovered?.dialTries, 1);
    assert.deepEqual(recovered?.dialReservedAt, reserved?.dialReservedAt);
    assert.equal(
      await reminders.authorizeDial(second, now, until, until),
      true,
    );
    await reminders.finish(
      seed.id,
      "completed",
      ["claimed"],
      undefined,
      second.claimToken!,
    );
  });

  it("the final dial authorization observes a meeting change committed while it waits", async () => {
    const seed = await execution();
    const claimed = await reminders.claimScheduled(seed.id, until);
    assert.ok(claimed);
    let locked!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const unblock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const moving = prisma.$transaction(async (tx) => {
      await tx.meeting.update({
        where: { id: seed.meetingId },
        data: { scheduleVersion: 2 },
      });
      locked();
      await unblock;
    });
    await acquired;
    const authorizing = reminders.authorizeDial(claimed, now, until, until);
    release();
    await moving;
    assert.equal(await authorizing, false);
    await reminders.finish(
      seed.id,
      "cancelled",
      ["claimed"],
      undefined,
      claimed.claimToken!,
    );
  });

  it("a paused policy cannot authorize a previously claimed execution", async () => {
    const calendar = await prisma.calendar.create({
      data: { ...ctx, name: "Reminder calendar" },
    });
    const policy = await prisma.meetingReminderPolicy.create({
      data: {
        ...ctx,
        calendarId: calendar.id,
        agentId,
        offsetsMinutes: [60],
      },
    });
    const seed = await execution();
    await prisma.meetingReminderExecution.update({
      where: { id: seed.id },
      data: {
        trigger: "policy",
        policyId: policy.id,
        policyVersion: 1,
      },
    });
    const claimed = await reminders.claimScheduled(seed.id, until);
    assert.ok(claimed);
    assert.equal(
      await reminders.authorizeDial(claimed, now, until, until),
      true,
    );
    await prisma.meetingReminderPolicy.update({
      where: { id: policy.id },
      data: { enabled: false },
    });
    assert.equal(
      await reminders.authorizeDial(claimed, now, until, until),
      false,
    );
    await reminders.finish(
      seed.id,
      "cancelled",
      ["claimed"],
      undefined,
      claimed.claimToken!,
    );
  });

  it("email claims respect the pilot organizations and cannot be shared", async () => {
    const seeded = await Promise.all([delivery(), delivery()]);
    assert.deepEqual(await emails.claimDue(now, until, 10, []), []);
    assert.deepEqual(await emails.claimDue(now, until, 10, [randomUUID()]), []);
    const batches = await Promise.all([
      emails.claimDue(now, until, 1, [organizationId]),
      emails.claimDue(now, until, 1, [organizationId]),
    ]);
    assert.deepEqual(
      new Set(batches.flat().map((row) => row.id)),
      new Set(seeded.map((row) => row.id)),
    );
    await prisma.meetingEmailDelivery.deleteMany({
      where: { id: { in: seeded.map((row) => row.id) } },
    });
  });

  it("email recovery preserves the first payload and rejects the old worker", async () => {
    const seed = await delivery();
    const [first] = await emails.claimDue(now, until, 1, [organizationId]);
    const payload = {
      to: ["lead@example.com"],
      subject: "Original",
      html: "Original",
    };
    const prepared = await emails.prepareSend(first, 1, now, payload);
    assert.deepEqual(prepared?.sendPayload, payload);
    await prisma.meetingEmailDelivery.update({
      where: { id: seed.id },
      data: { leaseExpiresAt: expired },
    });
    const [second] = await emails.claimDue(now, until, 1, [organizationId]);
    assert.notEqual(second.claimToken, first.claimToken);
    assert.equal(await emails.prepareSend(first, 1, now, payload), null);
    assert.equal(
      await emails.release(seed.id, "pending", "stale", first.claimToken!),
      false,
    );
    assert.equal(
      await emails.markSent(
        seed.id,
        {
          providerEmailId: "old",
          messageId: null,
          toAddresses: [],
          ccAddresses: [],
          replyTo: null,
          subject: "stale",
          inReplyTo: null,
        },
        first.claimToken!,
      ),
      false,
    );
    const recovered = await emails.prepareSend(
      second,
      1,
      new Date(now.getTime() + 1),
      { subject: "Changed" },
    );
    assert.deepEqual(recovered?.sendPayload, payload);
    assert.deepEqual(recovered?.firstAttemptAt, now);
    await emails.release(
      seed.id,
      "cancelled",
      "test complete",
      second.claimToken!,
    );
  });

  it("reassignment preserves an answer, but rescheduling invalidates its email", async () => {
    const seed = await delivery();
    const [claimed] = await emails.claimDue(now, until, 1, [organizationId]);
    await prisma.meeting.update({
      where: { id: seed.meetingId },
      data: { scheduleVersion: 2 },
    });
    assert.equal(await emails.prepareSend(claimed, 1, now, {}), null);
    assert.ok(
      await emails.prepareSend(claimed, 2, now, { subject: "New member" }),
    );
    await prisma.meeting.update({
      where: { id: seed.meetingId },
      data: {
        scheduleVersion: 3,
        attendanceStatus: "pending",
        attendanceScheduleVersion: null,
      },
    });
    assert.equal(await emails.prepareSend(claimed, 3, now, {}), null);
    await emails.release(
      seed.id,
      "cancelled",
      "test complete",
      claimed.claimToken!,
    );
  });

  it("only one setup can create and associate an agent under the same claim", async () => {
    const token = randomUUID();
    const automation = await prisma.aiVoiceAgentAutomation.create({
      data: {
        ...ctx,
        capability: "receptionist",
        claimToken: token,
        claimedAt: now,
      },
    });
    const claim = { id: automation.id, token };
    assert.equal(
      await agents.createForAutomation(
        ctx,
        { name: "Stale", type: "receptionist" },
        { ...claim, token: randomUUID() },
      ),
      null,
    );
    const results = await Promise.all([
      agents.createForAutomation(
        ctx,
        { name: "One", type: "receptionist" },
        claim,
      ),
      agents.createForAutomation(
        ctx,
        { name: "Two", type: "receptionist" },
        claim,
      ),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    const saved = await prisma.aiVoiceAgentAutomation.findUniqueOrThrow({
      where: { id: automation.id },
    });
    assert.equal(saved.agentId, results.find(Boolean)?.id);
  });
});
