import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { AiVoiceAgentAutomationRepository } from "./ai-voice-agent-automation.repository";
import { AiVoiceAgentRepository } from "./ai-voice-agent.repository";
import { automaticContactDispatchAvailable } from "./contact.repository";
import { MeetingEmailDeliveryRepository } from "./meeting-email-delivery.repository";
import { MeetingReminderExecutionRepository } from "./meeting-reminder-execution.repository";
import { MeetingRepository } from "./meeting.repository";

// Explicit opt-in: never inherit a developer's application DATABASE_URL.
const url = process.env.RINGEE_AUTOMATION_TEST_DATABASE_URL;

/** Organizations admitted to automated work; personal owners as a second list. */
const admit = (
  organizationIds: string[] | null,
  personalUserIds: string[] = [],
) => ({ organizationIds, personalUserIds });

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
    assert.deepEqual(await emails.claimDue(now, until, 10, admit([])), []);
    assert.deepEqual(
      await emails.claimDue(now, until, 10, admit([randomUUID()])),
      [],
    );
    const batches = await Promise.all([
      emails.claimDue(now, until, 1, admit([organizationId])),
      emails.claimDue(now, until, 1, admit([organizationId])),
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
    const [first] = await emails.claimDue(
      now,
      until,
      1,
      admit([organizationId]),
    );
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
    const [second] = await emails.claimDue(
      now,
      until,
      1,
      admit([organizationId]),
    );
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

  it("an action receipt goes out only for its own meeting's and workspace's action", async () => {
    const otherOrganizationId = randomUUID();
    await prisma.organization.create({
      data: {
        id: otherOrganizationId,
        clerkId: `automation-test-${otherOrganizationId}`,
        name: "Another organization",
      },
    });
    const own = await meeting();
    const sibling = await meeting();
    const action = (
      meetingId: string,
      scope: { userId: string; organizationId: string },
    ) =>
      prisma.meetingAutomationAction.create({
        data: {
          ...scope,
          actionKey: `receipt-scope:${randomUUID()}`,
          meetingId,
          contactId,
          agentCallId: randomUUID(),
          agentId,
          kind: "booked",
          scheduleVersion: 1,
          scheduledAt: now,
          language: "en",
          evidence: {},
        },
      });
    const actions = [
      // The same workspace, another meeting.
      await action(sibling.id, ctx),
      // This meeting, another organization.
      await action(own.id, { userId, organizationId: otherOrganizationId }),
    ];
    try {
      for (const foreign of actions) {
        const receipt = await prisma.meetingEmailDelivery.create({
          data: {
            ...ctx,
            meetingId: own.id,
            actionId: foreign.id,
            kind: "booked",
            audience: "legacy",
            scheduleVersion: 1,
            idempotencyKey: randomUUID(),
          },
        });
        const claimed = (
          await emails.claimDue(now, until, 50, admit([organizationId]))
        ).find((row) => row.id === receipt.id);
        assert.ok(claimed);
        assert.equal(await emails.prepareSend(claimed, 1, now, {}), null);
        const stored = await prisma.meetingEmailDelivery.findUniqueOrThrow({
          where: { id: receipt.id },
        });
        assert.equal(stored.status, "cancelled");
        assert.equal(stored.lastError, "action_missing");
      }
    } finally {
      await prisma.meetingEmailDelivery.deleteMany({
        where: { actionId: { in: actions.map((row) => row.id) } },
      });
      await prisma.meetingAutomationAction.deleteMany({
        where: { id: { in: actions.map((row) => row.id) } },
      });
      await prisma.organization.deleteMany({
        where: { id: otherOrganizationId },
      });
    }
  });

  it("reassignment preserves an answer, but rescheduling invalidates its email", async () => {
    const seed = await delivery();
    const [claimed] = await emails.claimDue(
      now,
      until,
      1,
      admit([organizationId]),
    );
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

// ── Stage 4A: personal workspaces ──────────────────────────────────────────
//
// A personal workspace is its owner's `userId` with `organizationId IS NULL`
// (WRK-001). Every personal row shares that null organization, so each test
// keeps two freelancers apart, and one freelancer apart from the organization
// they also belong to.
describe(
  "Personal voice-agent workspaces — PostgreSQL scope (Stage 4A)",
  { skip: !url },
  () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const db = prisma as never;
    const automations = new AiVoiceAgentAutomationRepository(db);
    const emails = new MeetingEmailDeliveryRepository(db);
    const reminders = new MeetingReminderExecutionRepository(db);
    const meetings = new MeetingRepository(db);
    const owner = randomUUID();
    const stranger = randomUUID();
    const organizationId = randomUUID();
    const personal = { userId: owner, organizationId: null };
    const other = { userId: stranger, organizationId: null };
    const org = { userId: owner, organizationId };
    const now = new Date("2026-11-07T14:00:00.000Z");
    const until = new Date(now.getTime() + 300_000);
    const contacts: Record<string, string> = {};
    const agents: Record<string, string> = {};

    before(async () => {
      await prisma.user.createMany({ data: [{ id: owner }, { id: stranger }] });
      await prisma.organization.create({
        data: {
          id: organizationId,
          clerkId: `personal-scope-${organizationId}`,
          name: "Owner's organization",
        },
      });
      await prisma.organizationMembership.create({
        data: { organizationId, userId: owner, role: "org:admin" },
      });
      for (const [key, scope] of Object.entries({ personal, other, org })) {
        const contact = await prisma.contact.create({
          data: {
            ...scope,
            // The same person in all three workspaces.
            phoneNumber: "+12025550144",
            firstName: "Ana",
          },
        });
        contacts[key] = contact.id;
        const agent = await prisma.aiVoiceAgent.create({
          data: {
            ...scope,
            name: `Reminders ${key}`,
            type: "reminders_notifications",
            status: "active",
          },
        });
        agents[key] = agent.id;
      }
    });

    after(async () => {
      await prisma.meeting.deleteMany({
        where: { userId: { in: [owner, stranger] } },
      });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({
        where: { id: { in: [owner, stranger] } },
      });
      await prisma.$disconnect();
    });

    async function meeting(
      scope: { userId: string; organizationId: string | null },
      key: string,
    ) {
      return prisma.meeting.create({
        data: {
          ...scope,
          contactId: contacts[key],
          scheduledAt: new Date(now.getTime() + 3_600_000),
        },
      });
    }

    async function delivery(
      scope: { userId: string; organizationId: string | null },
      key: string,
      createdAt: Date,
    ) {
      const row = await meeting(scope, key);
      await prisma.meeting.update({
        where: { id: row.id },
        data: { attendanceStatus: "confirmed", attendanceScheduleVersion: 1 },
      });
      return prisma.meetingEmailDelivery.create({
        data: {
          ...scope,
          meetingId: row.id,
          kind: "attendance_confirmed",
          scheduleVersion: 1,
          idempotencyKey: randomUUID(),
          createdAt,
        },
      });
    }

    it("concurrent setups produce one rail automation per personal workspace", async () => {
      const capability = "appointment_booking" as const;
      const stale = new Date(Date.now() - 120_000);
      const claims = await Promise.all(
        Array.from({ length: 6 }, () =>
          automations.claim(personal, capability, randomUUID(), stale),
        ),
      );
      assert.equal(claims.filter((claim) => claim.claimed).length, 1);
      assert.equal(
        new Set(claims.map((claim) => claim.row.id)).size,
        1,
        "every request sees the one row",
      );
      // Re-running setup converges on that row, concurrently too.
      await Promise.all(
        Array.from({ length: 4 }, () =>
          automations.upsertForOwner(personal, capability, {
            agentId: agents.personal,
            enabled: true,
          }),
        ),
      );
      assert.equal(
        await prisma.aiVoiceAgentAutomation.count({
          where: { userId: owner, organizationId: null, capability },
        }),
        1,
      );
      // The owner's organization and another freelancer keep their own rows.
      await automations.upsertForOwner(org, capability, {
        agentId: agents.org,
        enabled: true,
      });
      await automations.upsertForOwner(other, capability, {
        agentId: agents.other,
        enabled: false,
      });
      assert.equal(
        (await automations.findForOwner(personal, capability))?.agentId,
        agents.personal,
      );
      assert.equal(
        (await automations.findForOwner(org, capability))?.agentId,
        agents.org,
      );
      assert.equal(
        (await automations.findForOwner(other, capability))?.agentId,
        agents.other,
      );
      // The partial index is the backstop for a writer outside the lock.
      await assert.rejects(
        prisma.aiVoiceAgentAutomation.create({
          data: { ...personal, capability },
        }),
        (error: { code?: string }) => error.code === "P2002",
      );
      // An organization row is still unique per organization, as before.
      await assert.rejects(
        prisma.aiVoiceAgentAutomation.create({
          data: { ...org, capability },
        }),
        (error: { code?: string }) => error.code === "P2002",
      );
    });

    it("a personal claim can create its agent; another workspace's claim cannot", async () => {
      const token = randomUUID();
      const row = await prisma.aiVoiceAgentAutomation.create({
        data: {
          ...personal,
          capability: "receptionist",
          claimToken: token,
          claimedAt: now,
        },
      });
      const repo = new AiVoiceAgentRepository(db);
      assert.equal(
        await repo.createForAutomation(
          other,
          { name: "Foreign", type: "receptionist" },
          { id: row.id, token },
        ),
        null,
      );
      assert.equal(
        await repo.createForAutomation(
          org,
          { name: "Organization", type: "receptionist" },
          { id: row.id, token },
        ),
        null,
      );
      const created = await repo.createForAutomation(
        personal,
        { name: "Mine", type: "receptionist" },
        { id: row.id, token },
      );
      assert.equal(created?.userId, owner);
      assert.equal(created?.organizationId, null);
    });

    it("email claims take admitted personal and organization work; unadmitted personal rows never take a slot", async () => {
      const old = new Date(now.getTime() - 10 * 60_000);
      // The oldest rows belong to a freelancer outside the pilot.
      const blocked = await Promise.all([
        delivery(other, "other", new Date(old.getTime() - 3000)),
        delivery(other, "other", new Date(old.getTime() - 2000)),
        delivery(other, "other", new Date(old.getTime() - 1000)),
      ]);
      const mine = await delivery(personal, "personal", old);
      const team = await delivery(org, "org", new Date(old.getTime() + 1000));
      const admitted = admit([organizationId], [owner]);
      const claimed = await emails.claimDue(now, until, 2, admitted);
      assert.deepEqual(
        new Set(claimed.map((row) => row.id)),
        new Set([mine.id, team.id]),
      );
      // Every organization ("*") still admits no personal workspace.
      const everyOrganization = await emails.claimDue(
        now,
        until,
        50,
        admit(null, []),
      );
      assert.ok(
        !everyOrganization.some((row) => blocked.some((b) => b.id === row.id)),
      );
      // Leave rows of other suites as they were.
      await prisma.meetingEmailDelivery.updateMany({
        where: {
          id: { in: everyOrganization.map((row) => row.id) },
          organizationId: { not: organizationId },
        },
        data: { status: "pending", claimToken: null, leaseExpiresAt: null },
      });
      assert.equal(
        await prisma.meetingEmailDelivery.count({
          where: {
            id: { in: blocked.map((row) => row.id) },
            status: "pending",
          },
        }),
        3,
      );
      // Once admitted, that freelancer's rows are claimed in their own turn.
      const later = await emails.claimDue(
        now,
        until,
        10,
        admit([], [stranger]),
      );
      assert.deepEqual(
        new Set(later.map((row) => row.id)),
        new Set(blocked.map((row) => row.id)),
      );
      await prisma.meetingEmailDelivery.updateMany({
        where: { id: { in: [...blocked, mine, team].map((row) => row.id) } },
        data: { status: "cancelled" },
      });
    });

    it("a personal email send is fenced to its own workspace's meeting", async () => {
      const row = await delivery(personal, "personal", now);
      const [claimed] = await emails.claimDue(
        now,
        until,
        1,
        admit([], [owner]),
      );
      assert.equal(claimed.id, row.id);
      // The same delivery presented as another freelancer's is not sent.
      assert.equal(
        await emails.prepareSend({ ...claimed, userId: stranger }, 1, now, {}),
        null,
      );
      assert.ok(await emails.prepareSend(claimed, 1, now, { subject: "Mine" }));
      assert.equal(
        (await emails.findByIdForOwner(personal, row.id))?.id,
        row.id,
      );
      assert.equal(await emails.findByIdForOwner(other, row.id), null);
      assert.equal(await emails.findByIdForOwner(org, row.id), null);
      await emails.release(row.id, "cancelled", "test", claimed.claimToken!);
    });

    it("the contact reservation and the reminder fence stay inside the owner's workspace", async () => {
      const plan = async (agentId: string) =>
        prisma.meetingReminderExecution.create({
          data: {
            ...personal,
            meetingId: (await meeting(personal, "personal")).id,
            agentId,
            trigger: "manual",
            scheduleVersion: 1,
            fireAt: now,
            idempotencyKey: randomUUID(),
          },
        });
      const claim = async (id: string) =>
        (await reminders.claimDue(now, until, 50)).find((row) => row.id === id);
      // An execution naming another freelancer's agent is refused at the
      // commit point, though both rows have no organization.
      const crossed = await plan(agents.other);
      const claimedCrossed = await claim(crossed.id);
      assert.ok(claimedCrossed);
      assert.equal(
        await reminders.authorizeDial(claimedCrossed, now, now, until),
        false,
      );
      // The owner's own agent and meeting: authorized.
      const execution = await plan(agents.personal);
      const claimed = await claim(execution.id);
      assert.ok(claimed);
      assert.equal(
        await reminders.authorizeDial(claimed, now, now, until),
        true,
      );
      // The reservation locks the contact only inside its own workspace.
      const reservation = (
        workspace: { userId: string; organizationId: string | null },
        key: string,
      ) =>
        prisma.$transaction((tx) =>
          automaticContactDispatchAvailable(tx, {
            workspace,
            contactId: contacts[key],
            timezone: "UTC",
            now,
            agreed: false,
            dailyLimit: 2,
          }),
        );
      assert.equal(await reservation(other, "personal"), false);
      assert.equal(await reservation(org, "personal"), false);
      // The owner's committed reminder occupies the owner's contact only.
      assert.equal(await reservation(personal, "personal"), false);
      assert.equal(await reservation(other, "other"), true);
      assert.equal(await reservation(org, "org"), true);
      await prisma.meetingReminderExecution.updateMany({
        where: { id: { in: [execution.id, crossed.id] } },
        data: { status: "cancelled" },
      });
    });

    it("action maintenance reads and completes only admitted, owned work", async () => {
      const ownMeeting = await meeting(personal, "personal");
      const foreignMeeting = await meeting(other, "other");
      const action = (scope: typeof personal, meetingId: string, key: string) =>
        prisma.meetingAutomationAction.create({
          data: {
            ...scope,
            actionKey: `personal-scope:${randomUUID()}`,
            meetingId,
            contactId: contacts[key],
            agentCallId: randomUUID(),
            agentId: agents[key],
            kind: "booked",
            scheduleVersion: 1,
            scheduledAt: now,
            language: "en",
            evidence: {},
            maintenanceReviewAt: new Date(Date.now() - 1000),
          },
        });
      const mine = await action(personal, ownMeeting.id, "personal");
      const foreign = await action(other, foreignMeeting.id, "other");
      const pending = await meetings.listPendingMaintenance(
        admit([], [owner]),
        500,
      );
      assert.ok(pending.some((row) => row.id === mine.id));
      assert.ok(!pending.some((row) => row.id === foreign.id));
      // Workspace-checked writes: another freelancer cannot complete it.
      assert.equal(
        (await meetings.completeMaintenance(mine.id, other)).count,
        0,
      );
      assert.equal(
        (await meetings.completeMaintenance(mine.id, personal)).count,
        1,
      );
    });

    it("a participation must name an organization or its owner", async () => {
      const call = await prisma.aiVoiceAgentCall.create({
        data: {
          ...personal,
          agentId: agents.personal,
          toNumber: "+12025550144",
          fromNumber: "+12025550100",
        },
      });
      const handoff = await prisma.aiVoiceAgentHandoff.create({
        data: {
          ...personal,
          purpose: "reschedule_meeting",
          agentCallId: call.id,
          sourceAgentId: agents.personal,
          meetingId: (await meeting(personal, "personal")).id,
          meetingScheduleVersion: 1,
          meetingScheduledAt: now,
          reason: "cannot_attend",
          language: "en",
          languageSource: "source_agent_voice",
          idempotencyKey: randomUUID(),
        },
      });
      await assert.rejects(
        prisma.aiVoiceAgentCallParticipant.create({
          data: {
            agentCallId: call.id,
            agentId: agents.personal,
            handoffId: handoff.id,
            role: "initial",
            sequence: 1,
          },
        }),
        /AiVoiceAgentCallParticipant_workspace_check/,
      );
      const created = await prisma.aiVoiceAgentCallParticipant.create({
        data: {
          userId: owner,
          agentCallId: call.id,
          agentId: agents.personal,
          handoffId: handoff.id,
          role: "initial",
          sequence: 1,
        },
      });
      assert.equal(created.organizationId, null);
    });
  },
);
