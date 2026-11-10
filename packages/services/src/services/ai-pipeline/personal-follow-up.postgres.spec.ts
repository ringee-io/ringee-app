import {
  isolateFollowUpWorkerFixtures,
  FOLLOW_UP_SUITE_TIMEOUT_MS,
} from "../../../test/postgres-worker-fixture";
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import {
  PrismaClient,
  PendingActionRepository,
  CallbackTaskRepository,
  ContactRepository,
  CallRepository,
  MeetingRepository,
  OrganizationRepository,
  AiVoiceAgentAutomationRepository,
  AiVoiceAgentRepository,
  AiVoiceAgentCallRepository,
  CalendarRepository,
  DNCEntryRepository,
  MeetingReminderPolicyRepository,
  UserRepository,
} from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";
import { ComplianceService } from "../outbound/compliance.service";
import { PendingActionService } from "./pending-action.service";
import { MeetingService } from "../meeting.service";
import { MeetingEmailService } from "../meeting-email.service";

/**
 * Stage 4A on real PostgreSQL: the Stage 2/3 human-outcome follow-up in a
 * personal (freelancer) workspace. Two freelancers share a contact's phone
 * number and a null organization; the enrolled one is also a member of an
 * organization that runs its own follow-up. Providers are never called: the
 * placed leg is a row these tests write, as the dial path would.
 */
const url = process.env.RINGEE_FOLLOWUP_TEST_DATABASE_URL;
describe(
  "Stage 4A personal workspaces — disposable PostgreSQL",
  { skip: !url, timeout: FOLLOW_UP_SUITE_TIMEOUT_MS },
  () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const db = prisma as never;
    const repo = new PendingActionRepository(db);
    const callbacks = new CallbackTaskRepository(db);
    const calls = new CallRepository(db);
    const meetings = new MeetingRepository(db);
    const contacts = new ContactRepository(db);
    const agents = new AiVoiceAgentRepository(db);
    const agentCalls = new AiVoiceAgentCallRepository(db);
    const organizations = new OrganizationRepository(db);
    const service = new PendingActionService(
      repo,
      {} as never,
      contacts,
      calls,
      meetings,
      organizations,
      new AiVoiceAgentAutomationRepository(db),
      agents,
      new CalendarRepository(db),
      new MeetingReminderPolicyRepository(db),
      new ComplianceService(new DNCEntryRepository(db), {
        enqueue: async () => undefined,
      } as never),
      callbacks,
    );
    const emails = new MeetingEmailService(
      {} as never,
      meetings,
      new UserRepository(db, {} as never),
      organizations,
      agentCalls,
      agents,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const owner = randomUUID();
    const stranger = randomUUID();
    const organizationId = randomUUID();
    const personal: OwnershipContext = { userId: owner, organizationId: null };
    const other: OwnershipContext = { userId: stranger, organizationId: null };
    const org: OwnershipContext = { userId: owner, organizationId };
    // One number per seed: a placed leg to it stays "live" for a while.
    const newPhone = () =>
      `+1202${Math.floor(Math.random() * 1e7)
        .toString()
        .padStart(7, "0")}`;
    const fixture: Record<
      "personal" | "other" | "org",
      { agentId: string; calendarId: string; numberId: string }
    > = {} as never;
    const config = apiConfiguration as unknown as {
      AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS: string[];
      AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS: string[];
    };
    const oldOrgs = config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS;
    const oldPersonal = config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS;
    let releaseFixture: (() => Promise<void>) | undefined;
    const manual = Object.assign(Object.create(MeetingService.prototype), {
      callRepo: calls,
      pendingActions: service,
      dispositions: { resolveSelectable: async () => null },
      pipelineFanout: { handleCallFinalized: () => undefined },
      crmCallLog: { enqueueOutcomeUpdate: async () => undefined },
      customIntegrationOutbound: {
        enqueueCallOutcomeUpdated: async () => undefined,
      },
      contactService: { addCallNote: async () => undefined },
    }) as MeetingService;

    async function workspace(key: keyof typeof fixture, ctx: OwnershipContext) {
      const number = await prisma.numberPurchased.create({
        data: {
          ...ctx,
          phoneNumber: `+1800${Math.floor(Math.random() * 1e7)
            .toString()
            .padStart(7, "0")}`,
          isoCountry: "US",
        },
      });
      const calendar = await prisma.calendar.create({
        data: {
          ...ctx,
          name: `Booking ${key}`,
          timezone: "UTC",
          isDefault: true,
        },
      });
      const agent = await prisma.aiVoiceAgent.create({
        data: {
          ...ctx,
          name: `Scheduling ${key}`,
          type: "appointment_booking",
          status: "active",
          providerAssistantId: `fixture-${randomUUID()}`,
          toolSecretHash: "fixture",
          calendarId: calendar.id,
          callerNumberId: number.id,
        },
      });
      await prisma.aiVoiceAgentAutomation.create({
        data: {
          ...ctx,
          capability: "appointment_booking",
          agentId: agent.id,
          settings: {
            receiptRecipients: "contact_responsible",
            humanFollowUp: {
              enabled: true,
              interestedObjective: "booking",
              authorizedByUserId: ctx.userId,
            },
          },
        },
      });
      await prisma.meetingReminderPolicy.create({
        data: {
          ...ctx,
          agentId: agent.id,
          calendarId: calendar.id,
          offsetsMinutes: [240],
          windowStartMinute: 0,
          windowEndMinute: 1439,
          windowDays: [0, 1, 2, 3, 4, 5, 6],
        },
      });
      fixture[key] = {
        agentId: agent.id,
        calendarId: calendar.id,
        numberId: number.id,
      };
    }

    before(async () => {
      assert.ok(["127.0.0.1", "localhost"].includes(new URL(url!).hostname));
      releaseFixture = await isolateFollowUpWorkerFixtures(prisma);
      config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = [organizationId];
      config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS = [owner];
      await prisma.user.createMany({
        data: [
          { id: owner, canCall: true, firstName: "Olivia" },
          { id: stranger, canCall: true },
        ],
      });
      await prisma.userEmail.create({
        data: { userId: owner, email: `${owner}@owner.test`, isPrimary: true },
      });
      await prisma.organization.create({
        data: { id: organizationId, clerkId: organizationId, name: "Team" },
      });
      await prisma.organizationMembership.create({
        data: { organizationId, userId: owner, role: "org:admin" },
      });
      await workspace("personal", personal);
      await workspace("other", other);
      await workspace("org", org);
    });

    after(async () => {
      try {
        config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = oldOrgs;
        config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS = oldPersonal;
        const users = { in: [owner, stranger] };
        await prisma.meetingEmailDelivery.deleteMany({
          where: { userId: users },
        });
        await prisma.callbackTask.deleteMany({ where: { userId: users } });
        await prisma.pendingAction.deleteMany({ where: { userId: users } });
        await prisma.meeting.deleteMany({ where: { userId: users } });
        await prisma.call.updateMany({
          where: { userId: users },
          data: { dispositionId: null },
        });
        await prisma.organization.delete({ where: { id: organizationId } });
        await prisma.user.deleteMany({ where: { id: users } });
      } finally {
        await releaseFixture?.();
        await prisma.$disconnect();
      }
    });

    async function seed(ctx: OwnershipContext, phone = newPhone()) {
      const contact = await prisma.contact.create({
        data: {
          ...ctx,
          name: "Ana Ruiz",
          firstName: "Ana",
          email: `ana.${randomUUID()}@lead.test`,
          phoneNumber: phone,
        },
      });
      const call = await prisma.call.create({
        data: {
          ...ctx,
          contactId: contact.id,
          source: "web",
          fromNumber: "+12025550100",
          toNumber: phone,
          direction: "outbound",
          status: "completed",
          answeredAt: new Date(),
          endedAt: new Date(),
        },
      });
      return { contact, call };
    }

    async function enroll(ctx: OwnershipContext = personal) {
      const f = await seed(ctx);
      const result = await manual.updateCallOutcome(ctx, f.call.id, {
        outcome: "interested",
      });
      assert.ok(result.followUp, "the owner's interested outcome enrolls");
      const objective = (await repo.followUpSnapshot(result.followUp.id))!;
      return { ...f, objective, callback: objective.callbacks[0]! };
    }

    async function claimAndDecide(f: Awaited<ReturnType<typeof enroll>>) {
      await prisma.callbackTask.update({
        where: { id: f.callback.id },
        data: { scheduledAt: new Date(Date.now() - 1000) },
      });
      const claimed = (
        await callbacks.claimDueAgentCallbacks(
          new Date(),
          new Date(Date.now() + 300000),
          100,
        )
      ).find((row) => row.id === f.callback.id);
      assert.ok(claimed);
      const callback = (await callbacks.beginAgentDial(
        claimed.id,
        claimed.claimToken!,
        new Date(),
        new Date(Date.now() + 300000),
      ))!;
      return {
        callback,
        decision: await service.decideHumanCallback(callback),
      };
    }

    /** The rows the common dial path writes before the provider leg. */
    async function placement(
      ctx: OwnershipContext,
      agentId: string,
      contact: { id: string; phoneNumber: string },
      callback: { id: string; scheduledAt: Date; dialTries: number },
    ) {
      const contactId = contact.id;
      const phone = contact.phoneNumber;
      const call = await prisma.call.create({
        data: {
          ...ctx,
          contactId,
          source: "ai_voice_agent",
          direction: "outbound",
          fromNumber: "+12025550100",
          toNumber: phone,
          status: "pending",
        },
      });
      const agentCall = await prisma.aiVoiceAgentCall.create({
        data: {
          ...ctx,
          agentId,
          callId: call.id,
          contactId,
          fromNumber: "+12025550100",
          toNumber: phone,
          status: "initiating",
          idempotencyKey: `callback:${callback.id}:${callback.scheduledAt.getTime()}:d${callback.dialTries}`,
        },
      });
      return { agentCallId: agentCall.id, callId: call.id };
    }

    it("enrolls the owner's personal objective in its own scope, and nothing for a freelancer outside the pilot", async () => {
      const f = await enroll();
      const action = await prisma.pendingAction.findUniqueOrThrow({
        where: { id: f.objective.pendingActionId },
      });
      assert.equal(action.userId, owner);
      assert.equal(action.organizationId, null);
      assert.equal(action.contextType, "personal");
      assert.equal(action.contextKey, `personal:${owner}`);
      assert.equal(
        f.objective.sourceKey,
        `personal:${owner}:human_call:${f.call.id}`,
      );
      assert.equal(f.objective.agentId, fixture.personal.agentId);
      assert.equal(f.objective.calendarId, fixture.personal.calendarId);
      assert.equal(f.callback.organizationId, null);
      assert.equal(f.callback.userId, owner);
      // Saving the same outcome again neither duplicates nor revises it.
      const again = await manual.updateCallOutcome(personal, f.call.id, {
        outcome: "interested",
      });
      assert.equal(again.followUp?.id, f.objective.id);
      assert.equal(
        await prisma.pendingActionFollowUp.count({
          where: { sourceKey: f.objective.sourceKey },
        }),
        1,
      );

      // The other freelancer has the same policy saved but no enrollment.
      const outside = await seed(other);
      const saved = await manual.updateCallOutcome(other, outside.call.id, {
        outcome: "interested",
      });
      assert.equal(saved.followUp ?? null, null);
      assert.equal(
        await prisma.pendingAction.count({ where: { userId: stranger } }),
        0,
      );
    });

    it("dispatches in the objective's persisted personal scope, never the owner's organization, and ignores another freelancer's DNC", async () => {
      const f = await enroll();
      // The other freelancer keeps the same number on their own DNC list.
      await prisma.dNCEntry.create({
        data: {
          ...other,
          phoneNumber: f.contact.phoneNumber,
          reason: "theirs",
        },
      });
      const { callback, decision } = await claimAndDecide(f);
      assert.equal(decision.action, "dial");
      if (decision.action !== "dial") return;
      // The owner also administers an organization with its own specialist;
      // the deferred step still runs where it was created.
      assert.deepEqual(decision.ctx, personal);
      assert.equal(decision.agentId, fixture.personal.agentId);
      // A placement written in the owner's organization is refused.
      const foreign = await placement(
        org,
        fixture.org.agentId,
        f.contact,
        callback,
      );
      await assert.rejects(
        service.authorizeHumanCallbackDial(callback, decision, foreign),
        /Follow-up dispatch refused/,
      );
      const own = await placement(
        personal,
        fixture.personal.agentId,
        f.contact,
        { ...callback, dialTries: callback.dialTries + 100 },
      );
      await service.authorizeHumanCallbackDial(callback, decision, own);
      const committed = await prisma.callbackTask.findUniqueOrThrow({
        where: { id: callback.id },
      });
      assert.ok(committed.dispatchCommittedAt);
      assert.equal(committed.agentCallId, own.agentCallId);
      const objective = (await repo.followUpSnapshot(f.objective.id))!;
      assert.equal(objective.state, "in_progress");
      assert.equal(objective.attemptCount, 1);
    });

    it("the owner's own DNC stops a personal dispatch", async () => {
      const f = await enroll();
      const entry = await prisma.dNCEntry.create({
        data: {
          ...personal,
          phoneNumber: f.contact.phoneNumber,
          reason: "owner list",
        },
      });
      try {
        const { decision } = await claimAndDecide(f);
        assert.deepEqual(decision, {
          action: "skip",
          status: "missed",
          reason: "contact_on_dnc",
        });
      } finally {
        await prisma.dNCEntry.delete({ where: { id: entry.id } });
      }
    });

    it("resolves only from the exact personal reservation, with an attributed note and receipts to the owner", async () => {
      const f = await enroll();
      const { callback, decision } = await claimAndDecide(f);
      if (decision.action !== "dial") throw new Error("Not dialable");
      const placed = await placement(
        personal,
        fixture.personal.agentId,
        f.contact,
        callback,
      );
      await service.authorizeHumanCallbackDial(callback, decision, placed);
      // Another freelancer cannot book through this personal execution.
      assert.equal(
        await meetings.createIfAvailable(
          other,
          {
            contactId: f.contact.id,
            calendarId: fixture.personal.calendarId,
            callId: placed.callId,
            agentCallId: placed.agentCallId,
            actorAgentId: fixture.personal.agentId,
            scheduledAt: new Date(Date.now() + 2 * 86400000),
            duration: 30,
            responsibleUserId: owner,
          },
          { calendarId: fixture.personal.calendarId, isDefault: true },
          null,
        ),
        null,
      );
      const meeting = await meetings.createIfAvailable(
        personal,
        {
          contactId: f.contact.id,
          calendarId: fixture.personal.calendarId,
          callId: placed.callId,
          agentCallId: placed.agentCallId,
          actorAgentId: fixture.personal.agentId,
          scheduledAt: new Date(Date.now() + 3 * 86400000),
          duration: 30,
          responsibleUserId: owner,
        },
        { calendarId: fixture.personal.calendarId, isDefault: true },
        null,
      );
      assert.ok(meeting);
      assert.equal(meeting.organizationId, null);
      const action = await prisma.meetingAutomationAction.findUniqueOrThrow({
        where: { actionKey: `booking:${placed.agentCallId}` },
      });
      assert.equal(action.organizationId, null);
      assert.equal(action.userId, owner);
      assert.equal(action.followUpId, f.objective.id);
      assert.equal(
        await prisma.contactNote.count({
          where: { automationActionId: action.id, actorType: "ai" },
        }),
        1,
      );
      // The owner's adopted policy: one receipt to the responsible person and
      // one to the contact, both in the personal workspace.
      const receipts = await prisma.meetingEmailDelivery.findMany({
        where: { actionId: action.id },
        orderBy: { audience: "asc" },
      });
      assert.deepEqual(
        receipts.map((row) => [row.audience, row.organizationId, row.userId]),
        [
          ["contact", null, owner],
          ["responsible", null, owner],
        ],
      );
      const resolved = (await repo.followUpSnapshot(f.objective.id))!;
      assert.equal(resolved.state, "resolved");
      assert.equal(
        (resolved.resolutionEvidence as { actionId: string }).actionId,
        action.id,
      );
      // Recipients resolve to the owner, with no admins to copy.
      const people = await emails.people(meeting);
      assert.equal(people.responsible?.id, owner);
      assert.deepEqual(people.admins, []);
      // An organization meeting keeps copying its admins.
      const team = await seed(org);
      const orgMeeting = await meetings.create(org, {
        contactId: team.contact.id,
        calendarId: fixture.org.calendarId,
        scheduledAt: new Date(Date.now() + 4 * 86400000),
      });
      assert.deepEqual(
        (await emails.people(orgMeeting)).admins.map((user) => user.id),
        [owner],
      );
    });

    it("lets the owner read and control a personal objective; another freelancer cannot see it", async () => {
      const f = await enroll();
      const listed = await service.listFollowUps(personal, { limit: 100 });
      assert.ok(listed.data.some((row) => row.id === f.objective.id));
      assert.equal(
        (await service.listFollowUps(other)).meta.total,
        0,
        "nothing of another freelancer",
      );
      await assert.rejects(
        service.getFollowUp(other, f.objective.pendingActionId),
      );
      await assert.rejects(
        service.getFollowUp(org, f.objective.pendingActionId),
      );
      const paused = await service.controlFollowUp(
        personal,
        f.objective.pendingActionId,
        {
          operation: "pause",
          expectedRevision: f.objective.revision,
          reason: "Owner pauses",
        },
      );
      assert.equal(paused.state, "paused");
      assert.equal(
        await prisma.callbackTask.count({
          where: {
            followUpId: f.objective.id,
            status: { in: ["scheduled", "due", "in_progress"] },
          },
        }),
        0,
        "uncommitted steps are withdrawn",
      );
      await assert.rejects(
        service.controlFollowUp(other, f.objective.pendingActionId, {
          operation: "close",
          expectedRevision: f.objective.revision + 1,
          reason: "not mine",
          closureReason: "cancelled",
        }),
      );
    });

    it("taking the owner off the pilot stops new personal dispatch but keeps the objective and its history", async () => {
      const f = await enroll();
      config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS = [];
      try {
        const { decision } = await claimAndDecide(f);
        assert.deepEqual(decision, {
          action: "skip",
          status: "missed",
          reason: "specialist_unavailable",
        });
        await service.reconcileFollowUp(f.objective.id);
        const row = (await repo.followUpSnapshot(f.objective.id))!;
        assert.equal(row.state, "blocked");
        assert.equal(row.reason, "automations_disabled");
        // The organization the owner belongs to is unaffected.
        const team = await enroll(org);
        const { decision: teamDecision } = await claimAndDecide(team);
        assert.equal(teamDecision.action, "dial");
        if (teamDecision.action === "dial")
          assert.deepEqual(teamDecision.ctx, {
            userId: owner,
            organizationId,
          });
      } finally {
        config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS = [owner];
      }
    });
  },
);
