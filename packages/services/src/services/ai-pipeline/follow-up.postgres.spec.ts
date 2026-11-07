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
  AiVoiceAgentHandoffRepository,
  CallbackTaskRepository,
  ContactRepository,
  CallRepository,
  MeetingRepository,
  MeetingEmailDeliveryRepository,
  automaticContactDispatchAvailable,
  OrganizationRepository,
  AiVoiceAgentAutomationRepository,
  AiVoiceAgentRepository,
  CalendarRepository,
  CalendarIntegrationRepository,
  CalendarAvailabilityRepository,
  DNCEntryRepository,
  MeetingReminderPolicyRepository,
  AiVoiceAgentCallRepository,
  MeetingReminderExecutionRepository,
  type CallbackTask,
} from "@ringee/database";
import { MeetingEmailService } from "../meeting-email.service";
import { MeetingService } from "../meeting.service";
import { CalendarService } from "../calendar.service";
import type { EmailMessage } from "@ringee/platform";
import { ComplianceService } from "../outbound/compliance.service";
import { PendingActionService } from "./pending-action.service";
import { CallbackService } from "../outbound/callback.service";
import { VoiceAgentHandoffService } from "../voice-agents/automations/voice-agent-handoff.service";

// Explicit opt-in only. Never inherit the application's database for these tests.
const url = process.env.RINGEE_FOLLOWUP_TEST_DATABASE_URL;
describe(
  "Stage 1 follow-up — real PostgreSQL and domain services",
  { skip: !url, timeout: FOLLOW_UP_SUITE_TIMEOUT_MS },
  () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const db = prisma as never;
    const actions = new PendingActionRepository(db);
    const handoffRepo = new AiVoiceAgentHandoffRepository(db);
    const callbacks = new CallbackTaskRepository(db);
    const contacts = new ContactRepository(db);
    const calls = new CallRepository(db);
    const meetings = new MeetingRepository(db);
    const organizations = new OrganizationRepository(db);
    const automations = new AiVoiceAgentAutomationRepository(db);
    const agents = new AiVoiceAgentRepository(db);
    const calendars = new CalendarRepository(db);
    const policies = new MeetingReminderPolicyRepository(db);
    const agentCalls = new AiVoiceAgentCallRepository(db);
    const executions = new MeetingReminderExecutionRepository(db);
    const service = new PendingActionService(
      actions,
      {} as never,
      contacts,
      calls,
      meetings,
      organizations,
      automations,
      agents,
      calendars,
      policies,
      new ComplianceService(new DNCEntryRepository(db), {} as never),
      callbacks,
    );
    const handoffs = new VoiceAgentHandoffService(
      handoffRepo,
      automations,
      agents,
      agentCalls,
      calls,
      meetings,
      executions,
      policies,
      calendars,
      new CalendarService(
        new CalendarIntegrationRepository(db),
        meetings,
        new CalendarAvailabilityRepository(db),
        calendars,
        {} as never,
      ),
      contacts,
      {
        findById: async () => ({
          firstName: "Responsible",
          lastName: "Member",
        }),
      } as never,
      callbacks,
      { assistantHandoffMode: () => "assistant_tool" } as never,
      { previousInteractions: async () => "" } as never,
      service,
      organizations,
    );
    const organizationId = randomUUID();
    const adminId = randomUUID();
    const memberId = randomUUID();
    const colleagueId = randomUUID();
    const ctx = { userId: adminId, organizationId };
    const memberCtx = { userId: memberId, organizationId };
    const agentId = randomUUID();
    const sourceAgentId = randomUUID();
    const calendarId = randomUUID();
    const config = apiConfiguration as unknown as {
      AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS: string[];
    };
    const oldFlags = config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS;
    let releaseFixture: (() => Promise<void>) | undefined;
    // One number per seeded contact: a repeated one would see an earlier
    // fixture's live call as the person already being on the phone.
    let phoneSeq = 1000;

    before(async () => {
      assert.ok(
        new URL(url!).hostname === "127.0.0.1" ||
          new URL(url!).hostname === "localhost",
        "Use an isolated local test database",
      );
      releaseFixture = await isolateFollowUpWorkerFixtures(prisma);
      config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = [organizationId];
      await prisma.user.createMany({
        data: [adminId, memberId, colleagueId].map((id) => ({ id })),
      });
      await prisma.organization.create({
        data: {
          id: organizationId,
          clerkId: `stage1-${organizationId}`,
          name: "Stage 1 tests",
        },
      });
      await prisma.organizationMembership.createMany({
        data: [adminId, memberId, colleagueId].map((id) => ({
          organizationId,
          userId: id,
          role: id === adminId ? "org:admin" : "org:member",
        })),
      });
      await prisma.aiVoiceAgent.createMany({
        data: [
          {
            id: agentId,
            ...ctx,
            name: "Scheduling",
            type: "appointment_booking",
            status: "active",
            voiceLanguage: "en",
            providerAssistantId: `test-${agentId}`,
            toolSecretHash: "fixture-hash",
          },
          {
            id: sourceAgentId,
            ...ctx,
            name: "Reminders",
            type: "reminders_notifications",
            status: "active",
            voiceLanguage: "en",
            providerAssistantId: `test-${sourceAgentId}`,
            toolSecretHash: "fixture-hash",
          },
        ],
      });
      await prisma.aiVoiceAgentAutomation.create({
        data: { ...ctx, capability: "appointment_booking", agentId },
      });
      await prisma.calendar.create({
        data: { id: calendarId, ...ctx, name: "Tests", timezone: "UTC" },
      });
      await prisma.meetingReminderPolicy.create({
        data: {
          ...ctx,
          calendarId,
          agentId: sourceAgentId,
          offsetsMinutes: [240],
          windowStartMinute: 0,
          windowEndMinute: 1439,
          windowDays: [0, 1, 2, 3, 4, 5, 6],
        },
      });
    });
    after(async () => {
      try {
        config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = oldFlags;
        await prisma.pendingAction.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
        await prisma.user.deleteMany({
          where: { id: { in: [adminId, memberId, colleagueId] } },
        });
      } finally {
        await releaseFixture?.();
        await prisma.$disconnect();
      }
    });

    /** `placedBy`: the member who placed the reminder call (a "call now");
     * `responsibleUserId`: who the meeting is with. */
    async function seed(placedBy = adminId, responsibleUserId = memberId) {
      const now = new Date();
      const contact = await prisma.contact.create({
        data: {
          ...ctx,
          firstName: "Test",
          name: "Test Contact",
          phoneNumber: `+1202555${String(++phoneSeq).padStart(4, "0")}`,
        },
      });
      const meeting = await prisma.meeting.create({
        data: {
          ...ctx,
          contactId: contact.id,
          calendarId,
          responsibleUserId,
          scheduledAt: new Date(now.getTime() + 4 * 60 * 60_000),
        },
      });
      const call = await prisma.call.create({
        data: {
          ...ctx,
          userId: placedBy,
          contactId: contact.id,
          fromNumber: "+12025550100",
          toNumber: contact.phoneNumber,
          direction: "outbound",
          status: "answered",
          startedAt: now,
          answeredAt: now,
        },
      });
      const agentCall = await prisma.aiVoiceAgentCall.create({
        data: {
          ...ctx,
          userId: placedBy,
          agentId: sourceAgentId,
          callId: call.id,
          contactId: contact.id,
          toNumber: contact.phoneNumber,
          fromNumber: "+12025550100",
          status: "in_progress",
          providerCallControlId: `test-${call.id}`,
        },
      });
      await prisma.meetingReminderExecution.create({
        data: {
          ...ctx,
          userId: placedBy,
          agentId: sourceAgentId,
          agentCallId: agentCall.id,
          meetingId: meeting.id,
          scheduleVersion: meeting.scheduleVersion,
          fireAt: now,
          idempotencyKey: randomUUID(),
          status: "placed",
        },
      });
      const source = (await agents.findByIdForOwner(ctx, sourceAgentId))!;
      const preparedEvents = await Promise.all(
        Array.from({ length: 3 }, () =>
          handoffs.prepareReschedule(ctx, source, agentCall, {}, now),
        ),
      );
      const prepared = preparedEvents[0];
      assert.ok(prepared.handoff);
      const objective = (await actions.findFollowUpForHandoff(
        prepared.handoff.id,
      ))!;
      return {
        contact,
        meeting,
        call,
        agentCall,
        source,
        handoff: prepared.handoff,
        objective,
      };
    }

    async function schedule(
      f: Awaited<ReturnType<typeof seed>>,
      key = randomUUID(),
    ) {
      await handoffs.failToCallback(ctx, f.source, f.agentCall, {
        why: "provider_handoff_failed",
      });
      const created = await callbacks.createAgentCallbackOnce({
        ...ctx,
        contactId: f.contact.id,
        callId: f.call.id,
        handoffId: f.handoff.id,
        agentId,
        agentCallbackKind: "agreed",
        agentCallbackKey: key,
        scheduledAt: new Date(Date.now() - 1000),
      });
      await prisma.call.update({
        where: { id: f.call.id },
        data: { endedAt: new Date(), status: "completed" },
      });
      await prisma.aiVoiceAgentCall.update({
        where: { id: f.agentCall.id },
        data: { status: "completed" },
      });
      await service.reconcileFollowUp(f.objective.id);
      return created.callback;
    }

    async function claim(callbackId: string) {
      const now = new Date();
      // Other test fixtures are kept terminal after use, so this claim batch is isolated.
      const batch = await callbacks.claimDueAgentCallbacks(
        now,
        new Date(now.getTime() + 300_000),
        100,
      );
      const claimed = batch.find((row) => row.id === callbackId);
      assert.ok(claimed?.claimToken);
      return claimed;
    }

    async function placement(callback: CallbackTask) {
      const f = (await actions.followUpSnapshot(callback.followUpId!))!;
      const contact = (await contacts.findByIdForOwner(
        ctx,
        f.action.contactId!,
      ))!;
      const call = await prisma.call.create({
        data: {
          ...ctx,
          contactId: contact.id,
          fromNumber: "+12025550100",
          toNumber: contact.phoneNumber,
          direction: "outbound",
          status: "pending",
          startedAt: new Date(),
        },
      });
      const agentCall = await prisma.aiVoiceAgentCall.create({
        data: {
          ...ctx,
          agentId,
          callId: call.id,
          contactId: contact.id,
          toNumber: contact.phoneNumber,
          fromNumber: "+12025550100",
          idempotencyKey: `callback:${callback.id}:${callback.scheduledAt.getTime()}:d${callback.dialTries}`,
          status: "created",
        },
      });
      return {
        callbackId: callback.id,
        claimToken: callback.claimToken!,
        followUpId: f.id,
        expectedRevision: f.revision,
        agentId,
        meetingId: f.meetingId!,
        meetingVersion: f.sourceRevision,
        contactUpdatedAt: contact.updatedAt,
        to: contact.phoneNumber,
        placement: { agentCallId: agentCall.id, callId: call.id },
        now: new Date(),
      };
    }

    async function close(id: string) {
      const row = (await actions.followUpSnapshot(id))!;
      if (["resolved", "closed"].includes(row.state)) return;
      await service.controlFollowUp(ctx, row.pendingActionId, {
        operation: "close",
        expectedRevision: row.revision,
        closureReason: "cancelled",
        reason: "Test finished",
      });
    }

    async function offerAndMove(
      f: Awaited<ReturnType<typeof seed>>,
      start: Date,
    ) {
      const destination = (await agents.findByIdForOwner(ctx, agentId))!;
      const grant = await handoffs.grantFor(destination, f.agentCall);
      assert.equal(grant.kind, "participant");
      await handoffRepo.recordOffer(f.handoff.id, {
        agentCallId: f.agentCall.id,
        slots: [{ start: start.toISOString(), label: "Offered time" }],
        now: new Date(),
      });
      return meetings.rescheduleIfAvailable(
        ctx,
        {
          meetingId: f.meeting.id,
          expectedScheduleVersion: f.meeting.scheduleVersion,
          scheduledAt: start,
          actorAgentId: agentId,
          email: {
            idempotencyKey: `test:${f.handoff.id}`,
            agentCallId: f.agentCall.id,
          },
        },
        { calendarId, isDefault: false },
        null,
      );
    }

    it("Stage 3: commits a same-call move, exact objective evidence, both histories and receipt once", async () => {
      const f = await seed();
      const start = new Date("2098-01-01T12:00:00Z");
      const first = await offerAndMove(f, start);
      assert.equal(first.result, "moved");
      const repeats = await Promise.all(
        Array.from({ length: 4 }, () => offerAndMove(f, start)),
      );
      assert.ok(
        repeats.every((result) => result.result === "moved" && result.repeated),
      );
      const stored = await meetings.findById(f.meeting.id);
      assert.equal(stored?.scheduleVersion, 2);
      assert.equal(stored?.attendanceStatus, "pending");
      assert.equal(
        await prisma.meeting.count({ where: { contactId: f.contact.id } }),
        1,
      );
      const [action] = await prisma.meetingAutomationAction.findMany({
        where: { handoffId: f.handoff.id },
      });
      assert.equal(action.kind, "rescheduled");
      assert.equal(
        action.previousScheduledAt?.getTime(),
        f.meeting.scheduledAt.getTime(),
      );
      assert.equal(action.callId, f.call.id);
      assert.equal(action.agentId, agentId);
      assert.equal(action.followUpId, f.objective.id);
      assert.equal(
        await prisma.contactNote.count({
          where: { automationActionId: action.id },
        }),
        1,
      );
      assert.equal(
        await prisma.meetingEmailDelivery.count({
          where: { actionId: action.id },
        }),
        2,
      );
      assert.equal(
        (await actions.followUpSnapshot(f.objective.id))?.state,
        "resolved",
      );
      assert.equal(
        (
          (await actions.followUpSnapshot(f.objective.id))
            ?.resolutionEvidence as { actionId: string }
        ).actionId,
        action.id,
      );
      const detail = await calls.findById(f.call.id);
      assert.ok(detail);
    });

    it("Stage 3: a participant already speaking may commit after pause, without another dispatch", async () => {
      const f = await seed();
      await handoffs.grantFor(
        (await agents.findByIdForOwner(ctx, agentId))!,
        f.agentCall,
      );
      const row = (await actions.followUpSnapshot(f.objective.id))!;
      await service.controlFollowUp(ctx, row.pendingActionId, {
        operation: "pause",
        expectedRevision: row.revision,
        reason: "Pause future attempts",
      });
      assert.equal(
        await handoffs.mayFinishMeetingRequest(
          (await handoffRepo.findById(f.handoff.id))!,
        ),
        true,
      );
      const result = await offerAndMove(f, new Date("2098-02-03T12:00:00Z"));
      assert.equal(result.result, "moved");
      assert.equal(
        (await actions.followUpSnapshot(f.objective.id))?.state,
        "resolved",
      );
      assert.equal(
        await prisma.callbackTask.count({
          where: {
            followUpId: f.objective.id,
            dispatchCommittedAt: { not: null },
          },
        }),
        0,
      );
    });

    it("Stage 3: a human move to the proposed time is stale, never attributed to the agent", async () => {
      const f = await seed();
      const start = new Date("2098-01-02T12:00:00Z");
      const destination = (await agents.findByIdForOwner(ctx, agentId))!;
      await handoffs.grantFor(destination, f.agentCall);
      await meetings.reschedule(f.meeting.id, { scheduledAt: start });
      const result = await offerAndMove(f, start);
      assert.equal(result.result, "stale");
      assert.equal(
        await prisma.meetingAutomationAction.count({
          where: { handoffId: f.handoff.id },
        }),
        0,
      );
      await service.reconcileFollowUp(f.objective.id);
      const objective = await actions.followUpSnapshot(f.objective.id);
      assert.equal(objective?.state, "resolved");
      assert.equal(
        (objective?.resolutionEvidence as { attribution: string }).attribution,
        "authoritative_meeting_record",
      );
    });

    it("Stage 3: a callback after the original appointment creates one linked replacement", async () => {
      const f = await seed();
      const callback = await schedule(f);
      const dispatch = await placement(callback);
      const callbackCall = await prisma.aiVoiceAgentCall.update({
        where: { id: dispatch.placement.agentCallId },
        data: {
          status: "in_progress",
          providerCallControlId: `test-${callback.id}`,
        },
      });
      await prisma.call.update({
        where: { id: dispatch.placement.callId },
        data: { status: "answered", answeredAt: new Date() },
      });
      const past = new Date(Date.now() - 60_000);
      await prisma.meeting.update({
        where: { id: f.meeting.id },
        data: { scheduledAt: past },
      });
      await handoffRepo.createCallbackParticipant({
        organizationId,
        handoffId: f.handoff.id,
        agentCallId: callbackCall.id,
        agentId,
        binding: {
          meetingId: f.meeting.id,
          meetingScheduleVersion: 1,
          calendarId,
        },
      });
      await prisma.callbackTask.update({
        where: { id: callback.id },
        data: { agentCallId: callbackCall.id, dispatchCommittedAt: new Date() },
      });
      const start = new Date("2098-01-03T12:00:00Z");
      await handoffRepo.recordOffer(f.handoff.id, {
        agentCallId: callbackCall.id,
        slots: [{ start: start.toISOString(), label: "Accepted" }],
        now: new Date(),
      });
      const move = () =>
        meetings.rescheduleIfAvailable(
          ctx,
          {
            meetingId: f.meeting.id,
            expectedScheduleVersion: 1,
            scheduledAt: start,
            actorAgentId: agentId,
            email: {
              idempotencyKey: f.handoff.id,
              agentCallId: callbackCall.id,
            },
          },
          { calendarId, isDefault: false },
          null,
        );
      const results = await Promise.all([move(), move(), move()]);
      assert.ok(
        results.every(
          (result) => result.result === "moved" && result.replacement,
        ),
      );
      const rows = await prisma.meeting.findMany({
        where: { contactId: f.contact.id },
      });
      assert.equal(rows.length, 2);
      assert.equal(
        rows.find((row) => row.id === f.meeting.id)?.scheduledAt.getTime(),
        past.getTime(),
      );
      assert.equal(
        rows.find((row) => row.id !== f.meeting.id)?.replacesMeetingId,
        f.meeting.id,
      );
      assert.equal(
        (await actions.followUpSnapshot(f.objective.id))?.state,
        "resolved",
      );
    });

    it("Stage 3: a reservation and a move cannot both take the last calendar place", async () => {
      const f = await seed();
      const start = new Date("2098-01-04T12:00:00Z");
      const [moved, booked] = await Promise.all([
        offerAndMove(f, start),
        meetings.createIfAvailable(
          ctx,
          {
            contactId: f.contact.id,
            scheduledAt: start,
            calendarId,
          },
          { calendarId, isDefault: false },
          null,
        ),
      ]);
      assert.equal(
        Number(moved.result === "moved") + Number(Boolean(booked)),
        1,
      );
      assert.equal(
        await prisma.meeting.count({
          where: { calendarId, scheduledAt: start },
        }),
        1,
      );
      await close(f.objective.id);
    });

    it("Stage 3: attendance decline alone keeps the booking and creates no final rejection receipt", async () => {
      const f = await seed();
      const execution = (await executions.findByAgentCallId(f.agentCall.id))!;
      const result = await meetings.recordAttendance(ctx, {
        meetingId: f.meeting.id,
        expectedScheduleVersion: 1,
        status: "declined",
        agentCallId: f.agentCall.id,
        actorAgentId: sourceAgentId,
        executionId: execution.id,
        email: null,
      });
      assert.equal(result.result, "recorded");
      assert.equal(
        (await meetings.findById(f.meeting.id))?.status,
        "scheduled",
      );
      assert.equal(
        await prisma.meetingEmailDelivery.count({
          where: { meetingId: f.meeting.id },
        }),
        0,
      );
      // Keeping the appointment leaves what is waiting to go out about it.
      const waiting = await prisma.meetingEmailDelivery.create({
        data: {
          ...ctx,
          meetingId: f.meeting.id,
          kind: "booked",
          idempotencyKey: randomUUID(),
        },
      });
      const kept = await meetings.recordAgentDecision(ctx, {
        meetingId: f.meeting.id,
        expectedScheduleVersion: 1,
        agentCallId: f.agentCall.id,
        actorAgentId: sourceAgentId,
        cancel: false,
        continueRescheduling: false,
        response: "I do not want another time. Please keep it for now.",
      });
      assert.equal(kept?.kind, "declined_without_rescheduling");
      assert.equal(
        (await meetings.findById(f.meeting.id))?.status,
        "scheduled",
      );
      assert.equal(
        (await actions.followUpSnapshot(f.objective.id))?.state,
        "closed",
      );
      assert.equal(
        (
          await prisma.meetingEmailDelivery.findUniqueOrThrow({
            where: { id: waiting.id },
          })
        ).status,
        "pending",
      );
      await prisma.meetingEmailDelivery.update({
        where: { id: waiting.id },
        data: { status: "cancelled" },
      });
    });

    it("Stage 3: explicit cancellation releases the slot while retaining an open request for another time", async () => {
      const f = await seed();
      const decide = () =>
        meetings.recordAgentDecision(ctx, {
          meetingId: f.meeting.id,
          expectedScheduleVersion: 1,
          agentCallId: f.agentCall.id,
          actorAgentId: sourceAgentId,
          cancel: true,
          continueRescheduling: true,
          response: "Yes, cancel that appointment; I still want another time.",
        });
      const results = await Promise.all([decide(), decide()]);
      assert.ok(results[0]);
      assert.equal(results[0]?.id, results[1]?.id);
      assert.equal(
        (await meetings.findById(f.meeting.id))?.status,
        "cancelled",
      );
      assert.equal((await meetings.findById(f.meeting.id))?.scheduleVersion, 2);
      assert.ok(
        !["resolved", "closed"].includes(
          (await actions.followUpSnapshot(f.objective.id))!.state,
        ),
      );
      const slot = new Date("2098-01-05T12:00:00Z");
      await prisma.meeting.update({
        where: { id: f.meeting.id },
        data: { scheduledAt: slot },
      });
      assert.ok(
        await meetings.createIfAvailable(
          ctx,
          { contactId: f.contact.id, scheduledAt: slot, calendarId },
          { calendarId, isDefault: false },
          null,
        ),
      );
      await close(f.objective.id);
    });

    it("Stage 3: a changed answer on the same call is recorded as a correction, retried once", async () => {
      const f = await seed();
      const decide = (continueRescheduling: boolean, response: string) =>
        meetings.recordAgentDecision(ctx, {
          meetingId: f.meeting.id,
          expectedScheduleVersion: 1,
          agentCallId: f.agentCall.id,
          actorAgentId: sourceAgentId,
          cancel: true,
          continueRescheduling,
          response,
        });
      const keepGoing = "Yes, cancel it; I still want another time.";
      const stop = "Actually, no other time. Just cancel it.";
      const first = await decide(true, keepGoing);
      assert.ok(first);
      assert.equal((await decide(true, keepGoing))?.id, first.id);
      const corrected = await decide(false, stop);
      assert.ok(corrected);
      assert.notEqual(corrected.id, first.id);
      assert.equal(corrected.kind, "cancelled");
      assert.equal(
        (corrected.evidence as { correctsActionId?: string }).correctsActionId,
        first.id,
      );
      // The refusal ends the request; the appointment is not changed again.
      assert.equal(
        (await actions.followUpSnapshot(f.objective.id))?.state,
        "closed",
      );
      assert.equal((await meetings.findById(f.meeting.id))?.scheduleVersion, 2);
      assert.equal((await decide(false, stop))?.id, corrected.id);
      // A closed request is not reopened by changing the answer again.
      assert.equal(await decide(true, "Wait, find me another time."), null);
      // Only the decision itself owed a receipt.
      assert.equal(
        await prisma.meetingEmailDelivery.count({
          where: { actionId: corrected.id },
        }),
        0,
      );
    });

    it("Stage 3: explicit cancellation can continue to one replacement on the same call", async () => {
      const f = await seed();
      const decision = await meetings.recordAgentDecision(ctx, {
        meetingId: f.meeting.id,
        expectedScheduleVersion: 1,
        agentCallId: f.agentCall.id,
        actorAgentId: sourceAgentId,
        cancel: true,
        continueRescheduling: true,
        response: "Yes, cancel the original and find another time now.",
      });
      assert.ok(decision);
      const grant = await handoffs.grantFor(
        (await agents.findByIdForOwner(ctx, agentId))!,
        f.agentCall,
      );
      assert.equal(grant.kind, "participant");
      if (grant.kind !== "participant") return;
      assert.equal(grant.participant.meetingScheduleVersion, 2);
      assert.equal((await handoffs.availabilityFor(ctx, grant)).ok, true);
      const start = new Date("2098-02-04T12:00:00Z");
      await handoffRepo.recordOffer(f.handoff.id, {
        agentCallId: f.agentCall.id,
        slots: [{ start: start.toISOString(), label: "Accepted" }],
        now: new Date(),
      });
      const result = await meetings.rescheduleIfAvailable(
        ctx,
        {
          meetingId: f.meeting.id,
          expectedScheduleVersion: 2,
          scheduledAt: start,
          actorAgentId: agentId,
          email: { idempotencyKey: f.handoff.id, agentCallId: f.agentCall.id },
        },
        { calendarId, isDefault: false },
        null,
      );
      assert.equal(result.result, "moved");
      assert.ok(result.result === "moved" && result.replacement);
      assert.equal(
        (await meetings.findById(f.meeting.id))?.status,
        "cancelled",
      );
      assert.equal(
        (await actions.followUpSnapshot(f.objective.id))?.state,
        "resolved",
      );
    });

    it("Stage 3: stale versions, outgoing participants and foreign workspaces cannot cancel", async () => {
      const f = await seed();
      const decide = (scope = ctx, version = 1) =>
        meetings.recordAgentDecision(scope, {
          meetingId: f.meeting.id,
          expectedScheduleVersion: version,
          agentCallId: f.agentCall.id,
          actorAgentId: sourceAgentId,
          cancel: true,
          continueRescheduling: false,
          response: "Yes, cancel.",
        });
      assert.equal(
        await decide({ userId: adminId, organizationId: randomUUID() }),
        null,
      );
      assert.equal(await decide(ctx, 9), null);
      await handoffs.grantFor(
        (await agents.findByIdForOwner(ctx, agentId))!,
        f.agentCall,
      );
      assert.equal(await decide(), null);
      assert.equal(
        (await meetings.findById(f.meeting.id))?.status,
        "scheduled",
      );
      await close(f.objective.id);
    });

    it("Stage 3: confirmation is bound to the current version and stores atomic AI evidence", async () => {
      const f = await seed();
      const execution = (await executions.findByAgentCallId(f.agentCall.id))!;
      const result = await meetings.recordAttendance(ctx, {
        meetingId: f.meeting.id,
        expectedScheduleVersion: 1,
        status: "confirmed",
        agentCallId: f.agentCall.id,
        actorAgentId: sourceAgentId,
        executionId: execution.id,
        email: { kind: "attendance_confirmed", idempotencyKey: randomUUID() },
      });
      assert.equal(result.result, "recorded");
      assert.equal(
        (await meetings.findById(f.meeting.id))?.attendanceScheduleVersion,
        1,
      );
      await meetings.reschedule(f.meeting.id, {
        scheduledAt: new Date("2098-01-06T12:00:00Z"),
      });
      const stale = await meetings.recordAttendance(ctx, {
        meetingId: f.meeting.id,
        expectedScheduleVersion: 1,
        status: "confirmed",
        agentCallId: f.agentCall.id,
        actorAgentId: sourceAgentId,
        executionId: execution.id,
        email: null,
      });
      assert.equal(stale.result, "stale");
      assert.equal(
        (await meetings.findById(f.meeting.id))?.attendanceStatus,
        "pending",
      );
      await service.reconcileFollowUp(f.objective.id);
    });

    it("Stage 3: restart repairs projections, preserves edited notes, and sends only the outstanding late-address receipt", async () => {
      const f = await seed();
      await prisma.aiVoiceAgentAutomation.updateMany({
        where: { organizationId, capability: "appointment_booking" },
        data: { settings: { receiptRecipients: "contact_responsible" } },
      });
      const result = await offerAndMove(f, new Date("2098-02-01T12:00:00Z"));
      assert.equal(result.result, "moved");
      const action = await prisma.meetingAutomationAction.findUniqueOrThrow({
        where: { actionKey: `reschedule:${f.handoff.id}` },
      });
      await prisma.contactNote.update({
        where: { automationActionId: action.id },
        data: { content: "Human correction: preserve this note." },
      });
      const replanned: string[] = [];
      const repairs = new MeetingService(
        meetings,
        calls,
        {
          cancelExternalEvent: async () => ({ status: "not_required" }),
        } as never,
        {} as never,
        {
          replanMeetingCalls: async (meeting: { id: string }) => {
            replanned.push(meeting.id);
          },
          rescheduleForSubject: async () => undefined,
          cancelForSubject: async () => undefined,
          cancelMeetingCalls: async () => undefined,
        } as never,
        contacts,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        new MeetingEmailDeliveryRepository(db),
        organizations,
        service,
      );
      repairs.retryExternalSync = async () =>
        ({ externalSyncStatus: "not_required" }) as never;
      await repairs.repairAutomationActions();
      await repairs.repairAutomationActions();
      assert.equal(replanned.filter((id) => id === f.meeting.id).length, 1);
      assert.equal((await meetings.findById(f.meeting.id))?.scheduleVersion, 2);
      assert.equal(
        (
          await prisma.contactNote.findUniqueOrThrow({
            where: { automationActionId: action.id },
          })
        ).content,
        "Human correction: preserve this note.",
      );
      assert.equal(
        await prisma.contactNote.count({
          where: { automationActionId: action.id },
        }),
        1,
      );

      // Other fixtures' queued receipts are outside this scenario.
      await prisma.meetingEmailDelivery.updateMany({
        where: { organizationId, actionId: { not: action.id } },
        data: { status: "cancelled" },
      });
      const accepted = new Map<string, EmailMessage>();
      const requests: EmailMessage[] = [];
      const deliveries = new MeetingEmailDeliveryRepository(db);
      const worker = () =>
        new MeetingEmailService(
          deliveries,
          meetings,
          {
            findById: async (id: string) => ({
              id,
              firstName: "Member",
              emails: [{ email: `${id}@member.test`, isPrimary: true }],
            }),
          } as never,
          organizations,
          agentCalls,
          agents,
          calendars,
          { resolveForAgent: async () => ({ name: "Tests" }) } as never,
          {
            idempotencyWindowMs: 86400000,
            send: async (message: EmailMessage) => {
              requests.push(message);
              accepted.set(message.idempotencyKey!, message);
              return {
                accepted: true,
                providerEmailId: `test-${message.idempotencyKey}`,
              };
            },
            getMessageId: async () => "<test@receipt.test>",
          } as never,
          handoffRepo,
        );
      const markSent = deliveries.markSent.bind(deliveries);
      let loseAcknowledgement = true;
      deliveries.markSent = async (...args) => {
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error("Test process failed after provider acceptance");
        }
        return markSent(...args);
      };
      await worker().drain();
      await worker().drain();
      let rows = await deliveries.listActionDeliveries(
        action.id,
        organizationId,
      );
      assert.equal(
        rows.find((row) => row.audience === "responsible")?.status,
        "sent",
      );
      assert.equal(
        rows.find((row) => row.audience === "contact")?.status,
        "needs_email",
      );
      assert.equal(accepted.size, 1);
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[0], requests[1]);
      await prisma.contact.update({
        where: { id: f.contact.id },
        data: { email: "late@contact.test" },
      });
      await worker().drain();
      await worker().drain();
      rows = await deliveries.listActionDeliveries(action.id, organizationId);
      assert.ok(rows.every((row) => row.status === "sent"));
      assert.equal(accepted.size, 2);
      assert.equal(requests.length, 3);
      assert.deepEqual(requests[2].to, ["late@contact.test"]);
      assert.deepEqual(requests[2].cc, []);
      assert.equal(requests[2].replyTo, `${memberId}@member.test`);
      assert.doesNotMatch(requests[2].text!, /Human correction|Test process/);
      await prisma.aiVoiceAgentAutomation.updateMany({
        where: { organizationId, capability: "appointment_booking" },
        data: { settings: {} },
      });
    });

    it("Stage 3: a late contact receipt is withdrawn when the team receipt will never go out", async () => {
      const f = await seed();
      // A workspace on the legacy policy: team first, the contact after it.
      await prisma.aiVoiceAgentAutomation.updateMany({
        where: { organizationId, capability: "appointment_booking" },
        data: { settings: {} },
      });
      const result = await offerAndMove(f, new Date("2098-02-10T12:00:00Z"));
      assert.equal(result.result, "moved");
      const action = await prisma.meetingAutomationAction.findUniqueOrThrow({
        where: { actionKey: `reschedule:${f.handoff.id}` },
      });
      await prisma.meetingEmailDelivery.updateMany({
        where: { organizationId, actionId: { not: action.id } },
        data: { status: "cancelled" },
      });
      await prisma.meetingEmailDelivery.updateMany({
        where: { actionId: action.id, audience: "legacy" },
        data: { status: "failed" },
      });
      const requests: EmailMessage[] = [];
      const deliveries = new MeetingEmailDeliveryRepository(db);
      await new MeetingEmailService(
        deliveries,
        meetings,
        {
          findById: async (id: string) => ({
            id,
            firstName: "Member",
            emails: [{ email: `${id}@member.test`, isPrimary: true }],
          }),
        } as never,
        organizations,
        agentCalls,
        agents,
        calendars,
        { resolveForAgent: async () => ({ name: "Tests" }) } as never,
        {
          idempotencyWindowMs: 86400000,
          send: async (message: EmailMessage) => {
            requests.push(message);
            return { accepted: true, providerEmailId: "test" };
          },
          getMessageId: async () => null,
        } as never,
        handoffRepo,
      ).drain();
      const late = (
        await deliveries.listActionDeliveries(action.id, organizationId)
      ).find((row) => row.audience === "contact_late");
      assert.equal(late?.status, "cancelled");
      assert.equal(late?.lastError, "team_delivery_not_sent");
      assert.equal(requests.length, 0);
    });

    it("Stage 3: an agreed callback stores its receipt atomically and withdraws it after closure", async () => {
      const f = await seed();
      const { callback } = await callbacks.createAgentCallbackOnce({
        ...ctx,
        contactId: f.contact.id,
        callId: f.call.id,
        handoffId: f.handoff.id,
        agentId,
        agentCallbackKind: "agreed",
        agentCallbackKey: randomUUID(),
        scheduledAt: new Date(Date.now() + 3600000),
      });
      const action = await prisma.meetingAutomationAction.findFirstOrThrow({
        where: { callbackId: callback.id },
      });
      assert.equal(action.kind, "recovery_callback");
      assert.equal(action.followUpId, f.objective.id);
      assert.notEqual(
        (await actions.followUpSnapshot(f.objective.id))!.state,
        "resolved",
      );
      const deliveryRepo = new MeetingEmailDeliveryRepository(db);
      assert.equal(
        (await deliveryRepo.listActionDeliveries(action.id, organizationId))
          .length,
        2,
      );
      await close(f.objective.id);
      const claimed = await deliveryRepo.claimDue(
        new Date(),
        new Date(Date.now() + 300000),
        500,
        [organizationId],
      );
      const row = claimed.find((item) => item.actionId === action.id)!;
      assert.ok(row);
      assert.equal(
        await deliveryRepo.prepareSend(row, 1, new Date(), {}),
        null,
      );
      assert.equal(
        (
          await deliveryRepo.listActionDeliveries(action.id, organizationId)
        ).find((item) => item.id === row.id)?.status,
        "cancelled",
      );
    });

    it("Stage 3: a cancellation that keeps rescheduling keeps the agreed callback's receipt", async () => {
      const f = await seed();
      const { callback } = await callbacks.createAgentCallbackOnce({
        ...ctx,
        contactId: f.contact.id,
        callId: f.call.id,
        handoffId: f.handoff.id,
        agentId,
        agentCallbackKind: "agreed",
        agentCallbackKey: randomUUID(),
        scheduledAt: new Date(Date.now() + 3600000),
      });
      const action = await prisma.meetingAutomationAction.findFirstOrThrow({
        where: { callbackId: callback.id },
      });
      assert.ok(
        await meetings.recordAgentDecision(ctx, {
          meetingId: f.meeting.id,
          expectedScheduleVersion: 1,
          agentCallId: f.agentCall.id,
          actorAgentId: sourceAgentId,
          cancel: true,
          continueRescheduling: true,
          response: "Yes, cancel it, and call me back when we agreed.",
        }),
      );
      const deliveryRepo = new MeetingEmailDeliveryRepository(db);
      const receipts = await deliveryRepo.listActionDeliveries(
        action.id,
        organizationId,
      );
      assert.ok(receipts.length > 0);
      assert.ok(receipts.every((row) => row.status === "pending"));
      // The meeting's version moved with the cancellation; the receipt is
      // about the callback, which still stands.
      const claimed = await deliveryRepo.claimDue(
        new Date(),
        new Date(Date.now() + 300000),
        500,
        [organizationId],
      );
      const row = claimed.find((item) => item.actionId === action.id)!;
      assert.ok(row);
      assert.ok(await deliveryRepo.prepareSend(row, 2, new Date(), {}));
      for (const item of claimed.filter((c) => c.actionId === action.id))
        await deliveryRepo.release(
          item.id,
          "cancelled",
          "test_finished",
          item.claimToken!,
        );
      await close(f.objective.id);
    });

    it("Stage 3: the four-hour retry query finds an unanswered reminder only while the lead has not answered", async () => {
      const f = await seed();
      const policy = await prisma.meetingReminderPolicy.findFirstOrThrow({
        where: { calendarId },
      });
      const confirmed = await prisma.meeting.create({
        data: {
          ...ctx,
          contactId: f.contact.id,
          calendarId,
          scheduledAt: f.meeting.scheduledAt,
          attendanceStatus: "confirmed",
        },
      });
      const unanswered = (meetingId: string) =>
        prisma.meetingReminderExecution.create({
          data: {
            ...ctx,
            agentId: sourceAgentId,
            meetingId,
            policyId: policy.id,
            policyVersion: policy.version,
            trigger: "policy",
            offsetMinutes: 240,
            attempt: 1,
            scheduleVersion: 1,
            fireAt: new Date(),
            idempotencyKey: randomUUID(),
            status: "no_answer",
          },
        });
      const pending = await unanswered(f.meeting.id);
      const answered = await unanswered(confirmed.id);
      const ids = (
        await executions.listUnansweredForRetry(new Date(), undefined, [
          organizationId,
        ])
      ).map((row) => row.id);
      assert.ok(ids.includes(pending.id));
      assert.ok(!ids.includes(answered.id));
      await prisma.meetingReminderExecution.updateMany({
        where: { id: { in: [pending.id, answered.id] } },
        data: { status: "skipped" },
      });
      await prisma.meeting.update({
        where: { id: confirmed.id },
        data: { status: "cancelled" },
      });
      await close(f.objective.id);
    });

    it("Stage 3: callbacks and reminders share one contact reservation and a daily cap", async () => {
      const f = await seed();
      const input = {
        organizationId,
        contactId: f.contact.id,
        timezone: "UTC",
        now: new Date(),
        agreed: false,
        dailyLimit: 2,
      };
      const execution = (await executions.findByAgentCallId(f.agentCall.id))!;
      const callback = await prisma.callbackTask.create({
        data: {
          ...ctx,
          contactId: f.contact.id,
          scheduledAt: new Date(),
          status: "scheduled",
          agentCallbackKind: "recovery",
          agentId,
        },
      });
      const claim = (kind: "reminder" | "callback") =>
        prisma.$transaction(async (tx) => {
          if (
            !(await automaticContactDispatchAvailable(tx, {
              ...input,
              ...(kind === "reminder"
                ? { reminderId: execution.id }
                : { callbackId: callback.id }),
            }))
          )
            return false;
          if (kind === "reminder")
            await tx.meetingReminderExecution.update({
              where: { id: execution.id },
              data: { dispatchCommittedAt: new Date() },
            });
          else
            await tx.callbackTask.update({
              where: { id: callback.id },
              data: { dispatchCommittedAt: new Date(), status: "in_progress" },
            });
          return true;
        });
      const won = await Promise.all([claim("reminder"), claim("callback")]);
      assert.equal(won.filter(Boolean).length, 1);
      await prisma.aiVoiceAgentCall.update({
        where: { id: f.agentCall.id },
        data: { status: "completed" },
      });
      await prisma.meetingReminderExecution.update({
        where: { id: execution.id },
        data: { status: "no_answer", dispatchCommittedAt: new Date() },
      });
      await prisma.callbackTask.update({
        where: { id: callback.id },
        data: { status: "completed", dispatchCommittedAt: new Date() },
      });
      assert.equal(
        await prisma.$transaction((tx) =>
          automaticContactDispatchAvailable(tx, input),
        ),
        false,
      );
      assert.equal(
        await prisma.$transaction((tx) =>
          automaticContactDispatchAvailable(tx, { ...input, agreed: true }),
        ),
        true,
      );
      await close(f.objective.id);
    });

    it("duplicate authorized Step 0 events create one action and objective", async () => {
      const f = await seed();
      await Promise.all(
        Array.from({ length: 5 }, () =>
          handoffs.prepareReschedule(ctx, f.source, f.agentCall, {}),
        ),
      );
      assert.equal(
        await prisma.pendingActionFollowUp.count({
          where: { handoffId: f.handoff.id },
        }),
        1,
      );
      assert.equal(
        (await actions.followUpEvents(f.objective.id)).filter(
          (event) => event.kind === "objective_initiated",
        ).length,
        1,
      );
      assert.equal(f.objective.responsibleUserId, memberId);
      assert.equal(f.objective.configuredByUserId, adminId);
      assert.equal(
        (await actions.findById(f.objective.pendingActionId))?.contextKey,
        `org_no_campaign:${organizationId}`,
      );
      assert.equal(await actions.badgeCount(memberCtx, memberId), 0);
      const queue = await actions.listOpenForCalling(memberCtx, {
        types: ["book_meeting"],
        dueBy: new Date(Date.now() + 86_400_000),
        now: new Date(),
        limit: 100,
      });
      assert.ok(!queue.some((row) => row.id === f.objective.pendingActionId));
      await close(f.objective.id);
    });

    it("a reminder call another member placed still opens its objective, configured by that member", async () => {
      const f = await seed(colleagueId);
      assert.equal(f.handoff.userId, colleagueId);
      assert.equal(f.objective.configuredByUserId, colleagueId);
      assert.equal(f.objective.responsibleUserId, memberId);
      await close(f.objective.id);
    });

    it("filling the contact's blanks while the callback is placed does not refuse its dispatch", async () => {
      const f = await seed();
      const callback = await schedule(f);
      let dials = 0;
      const worker = new CallbackService(
        callbacks,
        {} as never,
        {} as never,
        {} as never,
        contacts,
        { enqueue: async () => undefined } as never,
        agentCalls,
        {
          startCall: async (
            _ctx: unknown,
            _agent: string,
            _input: unknown,
            guard: (p: {
              agentCallId: string;
              callId: string;
            }) => Promise<void>,
          ) => {
            const current = (await callbacks.findById(callback.id))!;
            const pending = await placement(current);
            // VoiceAgentCallService fills blanks from the call's variables
            // (here the last name split from `name`) before the guard runs.
            await prisma.contact.update({
              where: { id: f.contact.id },
              data: { lastName: "Contact" },
            });
            await guard(pending.placement);
            dials++;
            return { id: pending.placement.agentCallId };
          },
        } as never,
        calls,
        handoffs,
        service,
      );
      await worker.processDueCallbacks();
      const stored = (await callbacks.findById(callback.id))!;
      assert.equal(dials, 1, `Callback reason: ${stored.reason}`);
      assert.notEqual(stored.dispatchCommittedAt, null);
      assert.notEqual(stored.status, "cancelled");
      await close(f.objective.id);
    });

    it("competing workers claim once; expired leases retain the execution and fence the old worker", async () => {
      const f = await seed();
      const callback = await schedule(f);
      const now = new Date();
      const results = await Promise.all([
        callbacks.claimDueAgentCallbacks(
          now,
          new Date(now.getTime() + 300_000),
          100,
        ),
        callbacks.claimDueAgentCallbacks(
          now,
          new Date(now.getTime() + 300_000),
          100,
        ),
      ]);
      const claims = results.flat().filter((row) => row.id === callback.id);
      assert.equal(claims.length, 1);
      const first = claims[0];
      const reserved = await callbacks.beginAgentDial(
        first.id,
        first.claimToken!,
        now,
        new Date(now.getTime() + 300_000),
      );
      assert.equal(reserved?.dialTries, 1);
      await prisma.callbackTask.update({
        where: { id: first.id },
        data: { leaseExpiresAt: new Date(0) },
      });
      const second = await claim(first.id);
      assert.notEqual(first.claimToken, second.claimToken);
      assert.equal(second.dialTries, 1);
      assert.equal(
        await callbacks.beginAgentDial(
          first.id,
          first.claimToken!,
          now,
          new Date(now.getTime() + 300_000),
        ),
        null,
      );
      assert.equal(
        await callbacks.finishAgentCallback(
          first.id,
          first.claimToken!,
          "missed",
          { now },
        ),
        false,
      );
      assert.equal(
        await callbacks.deferAgentCallback(
          first.id,
          first.claimToken!,
          now,
          "stale",
        ),
        false,
      );
      const input = await placement(second);
      assert.equal(
        await callbacks.commitFollowUpDispatch({
          ...input,
          claimToken: first.claimToken!,
        }),
        false,
      );
      await close(f.objective.id);
    });

    for (const operation of ["pause", "take_over", "close"] as const) {
      it(`${operation} committed before dispatch atomically withdraws a claimed step`, async () => {
        const f = await seed();
        const callback = await schedule(f);
        const claimed = await claim(callback.id);
        const reserved = (await callbacks.beginAgentDial(
          callback.id,
          claimed.claimToken!,
          new Date(),
          new Date(Date.now() + 300_000),
        ))!;
        const input = await placement(reserved);
        let acquired!: () => void;
        let release!: () => void;
        const locked = new Promise<void>((resolve) => {
          acquired = resolve;
        });
        const unblock = new Promise<void>((resolve) => {
          release = resolve;
        });
        const held = prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "AiVoiceAgentHandoff" WHERE "id" = ${f.handoff.id}::uuid FOR UPDATE`;
          acquired();
          await unblock;
        });
        await locked;
        const control = service.controlFollowUp(
          memberCtx,
          f.objective.pendingActionId,
          {
            operation,
            expectedRevision: input.expectedRevision,
            reason: "Explicit test decision",
            ...(operation === "close"
              ? { closureReason: "refusal" as const }
              : {}),
          },
        );
        release();
        await held;
        await control;
        assert.equal(await callbacks.commitFollowUpDispatch(input), false);
        assert.equal(
          (await callbacks.findById(callback.id))?.status,
          "cancelled",
        );
        const view = await service.getFollowUp(
          memberCtx,
          f.objective.pendingActionId,
        );
        assert.equal(view.state, operation === "close" ? "closed" : "paused");
        assert.ok(view.history.some((event) => event.actorType === "human"));
        await close(f.objective.id);
      });
    }

    it("one objective has one dispatcher, preserves counters, and a committed call can finish after pause", async () => {
      const f = await seed();
      const callback = await schedule(f);
      const claimed = await claim(callback.id);
      const reserved = (await callbacks.beginAgentDial(
        callback.id,
        claimed.claimToken!,
        new Date(),
        new Date(Date.now() + 300_000),
      ))!;
      const input = await placement(reserved);
      assert.deepEqual(
        (
          await Promise.all([
            callbacks.commitFollowUpDispatch(input),
            callbacks.commitFollowUpDispatch(input),
          ])
        ).sort(),
        [false, true],
      );
      let row = (await actions.followUpSnapshot(f.objective.id))!;
      assert.equal(row.attemptCount, 1);
      await service.controlFollowUp(memberCtx, row.pendingActionId, {
        operation: "pause",
        expectedRevision: row.revision,
        reason: "Pause while call finishes",
      });
      assert.equal(
        await callbacks.finishAgentCallback(
          callback.id,
          claimed.claimToken!,
          "completed",
          { now: new Date(), agentCallId: input.placement.agentCallId },
        ),
        true,
      );
      row = (await actions.followUpSnapshot(f.objective.id))!;
      assert.equal(row.state, "paused");
      assert.equal(row.attemptCount, 1);
      await close(f.objective.id);
    });

    it("dispatch revalidates membership, DNC, agent readiness and source version", async () => {
      for (const gate of ["membership", "dnc", "agent", "meeting"] as const) {
        const f = await seed();
        const step = await schedule(f);
        const claimed = await claim(step.id);
        const reserved = (await callbacks.beginAgentDial(
          step.id,
          claimed.claimToken!,
          new Date(),
          new Date(Date.now() + 300_000),
        ))!;
        const input = await placement(reserved);
        if (gate === "membership")
          await prisma.organizationMembership.deleteMany({
            where: { organizationId, userId: memberId },
          });
        if (gate === "dnc")
          await prisma.dNCEntry.create({
            data: { ...ctx, phoneNumber: input.to },
          });
        if (gate === "agent")
          await prisma.aiVoiceAgent.update({
            where: { id: agentId },
            data: { status: "disabled" },
          });
        if (gate === "meeting")
          await prisma.meeting.update({
            where: { id: f.meeting.id },
            data: { scheduleVersion: { increment: 1 } },
          });
        assert.equal(
          await callbacks.commitFollowUpDispatch(input),
          false,
          gate,
        );
        if (gate === "membership")
          await prisma.organizationMembership.create({
            data: { organizationId, userId: memberId, role: "org:member" },
          });
        if (gate === "dnc")
          await prisma.dNCEntry.deleteMany({
            where: { organizationId, phoneNumber: input.to },
          });
        if (gate === "agent")
          await prisma.aiVoiceAgent.update({
            where: { id: agentId },
            data: { status: "active" },
          });
        await close(f.objective.id);
      }
    });

    it("an objective that expired while the dispatch waited for its lock is not dispatched", async () => {
      const f = await seed();
      const step = await schedule(f);
      const claimed = await claim(step.id);
      const reserved = (await callbacks.beginAgentDial(
        step.id,
        claimed.claimToken!,
        new Date(),
        new Date(Date.now() + 300_000),
      ))!;
      const input = await placement(reserved);
      // The worker decided before the wait; the objective expired during it.
      const decidedAt = new Date(Date.now() - 5_000);
      await prisma.pendingActionFollowUp.update({
        where: { id: f.objective.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });
      assert.equal(
        await callbacks.commitFollowUpDispatch({ ...input, now: decidedAt }),
        false,
      );
      assert.equal(
        (await callbacks.findById(step.id))?.dispatchCommittedAt,
        null,
      );
      await close(f.objective.id);
    });

    it("a dispatch waiting behind the pause transaction observes its committed state", async () => {
      const f = await seed();
      const step = await schedule(f);
      const claimed = await claim(step.id);
      const reserved = (await callbacks.beginAgentDial(
        step.id,
        claimed.claimToken!,
        new Date(),
        new Date(Date.now() + 300_000),
      ))!;
      const input = await placement(reserved);
      let acquired!: () => void;
      let release!: () => void;
      const locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const unblock = new Promise<void>((resolve) => {
        release = resolve;
      });
      const controlledPrisma = new Proxy(prisma, {
        get(target, property) {
          if (property === "$transaction")
            return (fn: (tx: unknown) => Promise<unknown>) =>
              target.$transaction(async (tx) => {
                const controlledTx = new Proxy(tx, {
                  get(transaction, name) {
                    if (name === "$queryRaw")
                      return async (
                        ...args: Parameters<typeof tx.$queryRaw>
                      ) => {
                        const result = await transaction.$queryRaw(...args);
                        if (String(args[0]).includes('"AiVoiceAgentHandoff"')) {
                          acquired();
                          await unblock;
                        }
                        return result;
                      };
                    return Reflect.get(transaction, name);
                  },
                });
                return fn(controlledTx);
              });
          return Reflect.get(target, property);
        },
      });
      const controlled = new PendingActionRepository(controlledPrisma as never);
      const pausing = controlled.applyFollowUpTransition({
        id: f.objective.id,
        expectedRevision: input.expectedRevision,
        plan: {
          state: "paused",
          reason: "Manual decision",
          nextAction: null,
          nextActionAt: null,
        },
        key: "test-pause-race",
        kind: "human_intervention",
        actorId: memberId,
        now: new Date(),
      });
      await locked;
      const dispatching = callbacks.commitFollowUpDispatch(input);
      release();
      assert.ok(await pausing);
      assert.equal(await dispatching, false);
      await close(f.objective.id);
    });

    it("reclaiming a lease between dispatch validation and its write fences the stale worker", async () => {
      const f = await seed();
      const step = await schedule(f);
      const claimed = await claim(step.id);
      const reserved = (await callbacks.beginAgentDial(
        step.id,
        claimed.claimToken!,
        new Date(),
        new Date(Date.now() + 300_000),
      ))!;
      const input = await placement(reserved);
      let validated!: () => void;
      let release!: () => void;
      const waiting = new Promise<void>((resolve) => {
        validated = resolve;
      });
      const unblock = new Promise<void>((resolve) => {
        release = resolve;
      });
      const controlledPrisma = new Proxy(prisma, {
        get(target, property) {
          if (property === "$transaction")
            return (fn: (tx: unknown) => Promise<unknown>) =>
              target.$transaction(async (tx) =>
                fn(
                  new Proxy(tx, {
                    get(transaction, name) {
                      if (name === "aiVoiceAgentCall")
                        return new Proxy(transaction.aiVoiceAgentCall, {
                          get(delegate, method) {
                            if (method === "findFirst")
                              return async (
                                ...args: Parameters<typeof delegate.findFirst>
                              ) => {
                                const result = await delegate.findFirst(
                                  ...args,
                                );
                                validated();
                                await unblock;
                                return result;
                              };
                            return Reflect.get(delegate, method);
                          },
                        });
                      return Reflect.get(transaction, name);
                    },
                  }),
                ),
              );
          return Reflect.get(target, property);
        },
      });
      const controlled = new CallbackTaskRepository(controlledPrisma as never);
      const dispatching = controlled.commitFollowUpDispatch(input);
      await waiting;
      await prisma.callbackTask.update({
        where: { id: step.id },
        data: { leaseExpiresAt: new Date(0) },
      });
      const newer = await claim(step.id);
      release();
      assert.equal(await dispatching, false);
      const stored = (await callbacks.findById(step.id))!;
      assert.equal(stored.claimToken, newer.claimToken);
      assert.equal(stored.dispatchCommittedAt, null);
      assert.equal(
        (await actions.followUpSnapshot(f.objective.id))?.attemptCount,
        0,
      );
      await close(f.objective.id);
    });

    it("callback recovery after post-placement persistence failure never redials; completing the call is not resolution", async () => {
      const f = await seed();
      const callback = await schedule(f);
      let dials = 0;
      let failWrite = true;
      const callbackRepo = new CallbackTaskRepository(db);
      const finish = callbackRepo.finishAgentCallback.bind(callbackRepo);
      callbackRepo.finishAgentCallback = async (...args) => {
        if (failWrite) {
          failWrite = false;
          throw new Error("simulated worker death after placement");
        }
        return finish(...args);
      };
      const worker = new CallbackService(
        callbackRepo,
        {} as never,
        {} as never,
        {} as never,
        contacts,
        { enqueue: async () => undefined } as never,
        agentCalls,
        {
          startCall: async (
            _ctx: unknown,
            _agent: string,
            input: { idempotencyKey: string },
            guard: (p: {
              agentCallId: string;
              callId: string;
            }) => Promise<void>,
          ) => {
            const current = (await callbackRepo.findById(callback.id))!;
            const pending = await placement(current);
            await guard(pending.placement);
            dials++;
            await prisma.aiVoiceAgentCall.update({
              where: { id: pending.placement.agentCallId },
              data: {
                providerCallControlId: `test-leg-${dials}`,
                status: "initiating",
              },
            });
            assert.equal(
              input.idempotencyKey,
              `callback:${callback.id}:${callback.scheduledAt.getTime()}:d1`,
            );
            return { id: pending.placement.agentCallId };
          },
        } as never,
        calls,
        handoffs,
        service,
      );
      await worker.processDueCallbacks();
      assert.equal(
        dials,
        1,
        `Callback reason: ${(await callbacks.findById(callback.id))?.reason}`,
      );
      assert.equal(
        (await callbacks.findById(callback.id))?.status,
        "in_progress",
      );
      await prisma.callbackTask.update({
        where: { id: callback.id },
        data: { leaseExpiresAt: new Date(0) },
      });
      await worker.processDueCallbacks();
      assert.equal(dials, 1);
      const completed = (await callbacks.findById(callback.id))!;
      assert.equal(completed.status, "completed");
      const placed = (await agentCalls.findById(completed.agentCallId!))!;
      await prisma.call.update({
        where: { id: placed.callId! },
        data: { status: "completed", endedAt: new Date() },
      });
      await service.reconcileFollowUp(
        f.objective.id,
        new Date(f.meeting.scheduledAt.getTime() + 60_000),
      );
      assert.notEqual(
        (await actions.followUpSnapshot(f.objective.id))?.state,
        "resolved",
      );
      assert.notEqual(
        (await actions.followUpSnapshot(f.objective.id))?.state,
        "closed",
      );
      await prisma.meeting.update({
        where: { id: f.meeting.id },
        data: {
          scheduleVersion: { increment: 1 },
          scheduledAt: new Date(f.meeting.scheduledAt.getTime() + 86_400_000),
          status: "rescheduled",
        },
      });
      await service.reconcileFollowUp(f.objective.id);
      const view = await service.getFollowUp(ctx, f.objective.pendingActionId);
      assert.equal(view.state, "resolved");
      assert.equal(view.calls.length, 2); // handoff uses the source leg, callback adds one.
      assert.ok(
        view.calls.every((call) => call.callCost === null && !call.settled),
      );
    });

    it("a meeting whose responsible member left still records its request, without an objective", async () => {
      // Leaving an organization ends the membership, not the user.
      const formerMemberId = randomUUID();
      await prisma.user.create({ data: { id: formerMemberId } });
      try {
        const f = await seed(adminId, formerMemberId);
        assert.equal(f.handoff.status, "prepared");
        assert.equal(f.handoff.requestStatus, "pending");
        assert.equal(f.objective, null);
        await prisma.call.update({
          where: { id: f.call.id },
          data: { endedAt: new Date(), status: "completed" },
        });
      } finally {
        await prisma.user.delete({ where: { id: formerMemberId } });
      }
    });

    it("a callback agreed after times were offered is kept once the call ends", async () => {
      const f = await seed();
      await handoffRepo.recordOffer(f.handoff.id, {
        agentCallId: f.agentCall.id,
        slots: [
          {
            start: new Date(Date.now() + 86_400_000).toISOString(),
            label: "Tomorrow",
          },
        ],
        now: new Date(),
      });
      // The person cannot choose yet and agrees to be called back.
      const { callback } = await callbacks.createAgentCallbackOnce({
        ...ctx,
        contactId: f.contact.id,
        callId: f.call.id,
        handoffId: f.handoff.id,
        agentId,
        agentCallbackKind: "agreed",
        agentCallbackKey: randomUUID(),
        scheduledAt: new Date(Date.now() + 3 * 60 * 60_000),
      });
      await prisma.call.update({
        where: { id: f.call.id },
        data: { endedAt: new Date(), status: "completed" },
      });
      await service.reconcileFollowUp(f.objective.id);
      const row = (await actions.followUpSnapshot(f.objective.id))!;
      assert.equal(row.state, "scheduled");
      assert.equal(
        (await callbacks.findById(callback.id))?.status,
        "scheduled",
      );
      assert.equal(
        (await handoffRepo.findById(f.handoff.id))?.requestStatus,
        "pending",
      );
      await close(f.objective.id);
    });

    it("availability offered on a live call leaves the request to the specialist until the call ends", async () => {
      const f = await seed();
      await handoffRepo.recordOffer(f.handoff.id, {
        agentCallId: f.agentCall.id,
        slots: [
          {
            start: new Date(Date.now() + 86_400_000).toISOString(),
            label: "Tomorrow",
          },
        ],
        now: new Date(),
      });
      // The specialist is still on the call that offered the times.
      await service.reconcileFollowUp(f.objective.id);
      let row = (await actions.followUpSnapshot(f.objective.id))!;
      assert.notEqual(row.state, "blocked");
      assert.equal(
        (await handoffRepo.findById(f.handoff.id))?.requestStatus,
        "pending",
      );
      // Over without a move: the specialist retains bounded recovery.
      await prisma.call.update({
        where: { id: f.call.id },
        data: { endedAt: new Date(), status: "completed" },
      });
      await service.reconcileFollowUp(f.objective.id);
      row = (await actions.followUpSnapshot(f.objective.id))!;
      assert.equal(row.state, "recovering");
      assert.equal(row.nextAction, "review_recovery");
      assert.equal(await actions.badgeCount(memberCtx, memberId), 0);
      await close(f.objective.id);
    });

    it("no callback is promised for an objective past its expiry, even before it is closed", async () => {
      const f = await seed();
      const handoff = { id: f.handoff.id, organizationId };
      assert.equal(await handoffs.callbackStillWanted(handoff), true);
      // Expiring at this very moment is expired.
      assert.equal(
        await handoffs.callbackStillWanted(handoff, f.objective.expiresAt),
        false,
      );
      // Nor is a callback promised for a time at or after the expiry.
      assert.equal(
        await handoffs.objectiveOpenAt(f.handoff.id, f.objective.expiresAt),
        false,
      );
      assert.equal(
        await handoffs.objectiveOpenAt(
          f.handoff.id,
          new Date(f.objective.expiresAt.getTime() - 1),
        ),
        true,
      );
      await close(f.objective.id);
    });

    it("a callback owned by a member who left the organization is not placed", async () => {
      const f = await seed(colleagueId);
      const { callback } = await callbacks.createAgentCallbackOnce({
        userId: colleagueId,
        organizationId,
        contactId: f.contact.id,
        callId: f.call.id,
        handoffId: f.handoff.id,
        agentId,
        agentCallbackKind: "agreed",
        agentCallbackKey: randomUUID(),
        scheduledAt: new Date(Date.now() - 1000),
      });
      await prisma.call.update({
        where: { id: f.call.id },
        data: { endedAt: new Date(), status: "completed" },
      });
      await prisma.organizationMembership.deleteMany({
        where: { organizationId, userId: colleagueId },
      });
      try {
        assert.deepEqual(await handoffs.decideCallback(callback), {
          action: "skip",
          status: "missed",
          reason: "owner_not_member",
        });
      } finally {
        await prisma.organizationMembership.create({
          data: { organizationId, userId: colleagueId, role: "org:member" },
        });
      }
      await close(f.objective.id);
    });

    it("offered availability keeps an agreed callback; a stored meeting change later resolves and withdraws it", async () => {
      const f = await seed();
      const callback = await schedule(f);
      await handoffRepo.recordOffer(f.handoff.id, {
        agentCallId: f.agentCall.id,
        slots: [
          {
            start: new Date(Date.now() + 86_400_000).toISOString(),
            label: "Tomorrow",
          },
        ],
        now: new Date(),
      });
      await service.reconcileFollowUp(f.objective.id);
      let row = (await actions.followUpSnapshot(f.objective.id))!;
      // The callback the person agreed to is the next step, offer or not.
      assert.equal(row.state, "scheduled");
      assert.equal(
        (await callbacks.findById(callback.id))?.status,
        "scheduled",
      );
      await prisma.meeting.update({
        where: { id: f.meeting.id },
        data: {
          scheduleVersion: { increment: 1 },
          scheduledAt: new Date(Date.now() + 86_400_000),
          status: "rescheduled",
        },
      });
      await service.reconcileFollowUp(f.objective.id);
      await service.reconcileFollowUp(f.objective.id);
      row = (await actions.followUpSnapshot(f.objective.id))!;
      assert.equal(row.state, "resolved");
      assert.equal(
        (await callbacks.findById(callback.id))?.status,
        "cancelled",
      );
      assert.equal(
        (await handoffRepo.findById(f.handoff.id))?.requestStatus,
        "resolved",
      );
      assert.equal(
        (await actions.followUpEvents(row.id)).filter(
          (event) => event.kind === "objective_resolved",
        ).length,
        1,
      );
    });

    it("resume calculates one future policy time and manual takeover requires explicit automatic return", async () => {
      const f = await seed();
      const callback = await schedule(f);
      let row = (await actions.followUpSnapshot(f.objective.id))!;
      await service.controlFollowUp(memberCtx, row.pendingActionId, {
        operation: "take_over",
        expectedRevision: row.revision,
        reason: "Handle personally",
      });
      row = (await actions.followUpSnapshot(row.id))!;
      await assert.rejects(
        service.controlFollowUp(memberCtx, row.pendingActionId, {
          operation: "resume",
          expectedRevision: row.revision,
        }),
        /explicitly/,
      );
      const now = new Date();
      // An open request may return explicitly to automatic work even when its
      // original was cancelled: a callback can create a linked replacement.
      await prisma.meeting.update({
        where: { id: f.meeting.id },
        data: { status: "cancelled" },
      });
      row = (await actions.followUpSnapshot(row.id))!;
      assert.equal(row.mode, "manual");
      await service.controlFollowUp(
        memberCtx,
        row.pendingActionId,
        { operation: "return_automatic", expectedRevision: row.revision },
        now,
      );
      const resumed = (await callbacks.findById(callback.id))!;
      assert.equal(resumed.status, "scheduled");
      assert.ok(resumed.scheduledAt.getTime() >= now.getTime() + 60 * 60_000);
      assert.equal(
        (await actions.followUpSnapshot(row.id))?.attemptCount,
        row.attemptCount,
      );
      await close(row.id);
    });

    it("exceptional human support is durable evidence without claiming resolution", async () => {
      const f = await seed();
      await schedule(f);
      const participant =
        await prisma.aiVoiceAgentCallParticipant.findFirstOrThrow({
          where: { handoffId: f.handoff.id },
        });
      await handoffRepo.recordExceptionalIntervention(
        f.handoff.id,
        participant.id,
        true,
      );
      await handoffRepo.recordExceptionalIntervention(
        f.handoff.id,
        participant.id,
        true,
      );
      await service.reconcileFollowUp(f.objective.id);
      const view = await service.getFollowUp(ctx, f.objective.pendingActionId);
      assert.equal(view.state, "blocked");
      assert.equal(view.reason, "human_support_requested");
      assert.equal(view.resolutionEvidence, null);
      assert.equal(
        view.history.filter((event) => event.kind === "exceptional_escalation")
          .length,
        1,
      );
      await close(f.objective.id);
    });

    it("repeated call reconciliation updates the review without inventing progress", async () => {
      const f = await seed();
      const callback = await schedule(f);
      const claimed = await claim(callback.id);
      const reserved = (await callbacks.beginAgentDial(
        callback.id,
        claimed.claimToken!,
        new Date(),
        new Date(Date.now() + 300_000),
      ))!;
      const input = await placement(reserved);
      assert.equal(await callbacks.commitFollowUpDispatch(input), true);
      const now = new Date();
      await service.reconcileFollowUp(f.objective.id, now);
      const first = (await actions.followUpSnapshot(f.objective.id))!;
      const count = await prisma.pendingActionFollowUpEvent.count({
        where: { followUpId: first.id },
      });
      await service.reconcileFollowUp(
        first.id,
        new Date(now.getTime() + 60_000),
      );
      const second = (await actions.followUpSnapshot(first.id))!;
      assert.equal(second.revision, first.revision);
      assert.equal(second.lastActionAt.getTime(), first.lastActionAt.getTime());
      assert.ok(second.nextActionAt! > first.nextActionAt!);
      assert.equal(
        await prisma.pendingActionFollowUpEvent.count({
          where: { followUpId: first.id },
        }),
        count,
      );
      await close(first.id);
    });

    it("workspace and member boundaries protect both reads and controls; observations hide colleague calls", async () => {
      const f = await seed();
      await assert.rejects(
        service.getFollowUp(
          { userId: adminId, organizationId: randomUUID() },
          f.objective.pendingActionId,
        ),
        /not found/,
      );
      await assert.rejects(
        service.getFollowUp(
          { userId: colleagueId, organizationId },
          f.objective.pendingActionId,
        ),
        /not found/,
      );
      await assert.rejects(
        service.controlFollowUp(
          { userId: colleagueId, organizationId },
          f.objective.pendingActionId,
          {
            operation: "pause",
            expectedRevision: f.objective.revision,
            reason: "Forbidden",
          },
        ),
        /not found/,
      );
      const view = await service.getFollowUp(
        memberCtx,
        f.objective.pendingActionId,
      );
      assert.deepEqual(view.calls, []);
      assert.equal(view.costsRestricted, true);
      const list = await service.list(memberCtx, { memberUserId: memberId });
      assert.equal(
        list.data.find((item) => item.id === f.objective.pendingActionId)
          ?.callId,
        null,
      );
      await assert.rejects(
        service.complete(memberCtx, f.objective.pendingActionId, {
          memberUserId: memberId,
        }),
        /lifecycle/,
      );
      await close(f.objective.id);
    });
  },
);
