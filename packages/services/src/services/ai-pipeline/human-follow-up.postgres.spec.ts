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
  CallAttemptRepository,
  CampaignLeadRepository,
  MeetingRepository,
  OrganizationRepository,
  AiVoiceAgentAutomationRepository,
  AiVoiceAgentRepository,
  CalendarRepository,
  DNCEntryRepository,
  MeetingReminderPolicyRepository,
  AiVoiceAgentCallRepository,
  type CallOutcome,
} from "@ringee/database";
import { ComplianceService } from "../outbound/compliance.service";
import { PendingActionService } from "./pending-action.service";
import { MeetingService } from "../meeting.service";
import { CallAttemptService } from "../outbound/call-attempt.service";
import { CallbackService } from "../outbound/callback.service";

const url = process.env.RINGEE_FOLLOWUP_TEST_DATABASE_URL;
describe(
  "Stage 2 human outcomes — disposable PostgreSQL",
  { skip: !url },
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
    const policies = new MeetingReminderPolicyRepository(db);
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
      policies,
      new ComplianceService(new DNCEntryRepository(db), {} as never),
      callbacks,
    );
    const organizationId = randomUUID();
    const userId = randomUUID();
    const colleagueId = randomUUID();
    const ctx = { userId, organizationId };
    const agentId = randomUUID();
    const calendarId = randomUUID();
    const config = apiConfiguration as unknown as {
      AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS: string[];
    };
    const oldFlags = config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS;
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
    before(async () => {
      assert.ok(["127.0.0.1", "localhost"].includes(new URL(url!).hostname));
      config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = [organizationId];
      await prisma.user.createMany({
        data: [{ id: userId, canCall: true }, { id: colleagueId }],
      });
      await prisma.organization.create({
        data: {
          id: organizationId,
          clerkId: organizationId,
          name: "Stage 2 disposable",
        },
      });
      await prisma.organizationMembership.createMany({
        data: [userId, colleagueId].map((id) => ({
          organizationId,
          userId: id,
          role: "org:member",
        })),
      });
      const number = await prisma.numberPurchased.create({
        data: {
          ...ctx,
          phoneNumber: `+1800${Math.floor(Math.random() * 1e7)
            .toString()
            .padStart(7, "0")}`,
          isoCountry: "US",
        },
      });
      await prisma.calendar.create({
        data: {
          ...ctx,
          id: calendarId,
          name: "Booking",
          timezone: "UTC",
          isDefault: true,
        },
      });
      await prisma.aiVoiceAgent.create({
        data: {
          ...ctx,
          id: agentId,
          name: "Scheduling",
          type: "appointment_booking",
          status: "active",
          providerAssistantId: `fixture-${agentId}`,
          toolSecretHash: "fixture",
          calendarId,
          callerNumberId: number.id,
        },
      });
      await prisma.aiVoiceAgentAutomation.create({
        data: {
          ...ctx,
          capability: "appointment_booking",
          agentId,
          settings: {
            humanFollowUp: { enabled: true, interestedObjective: "booking" },
          },
        },
      });
      await prisma.meetingReminderPolicy.create({
        data: {
          ...ctx,
          agentId,
          calendarId,
          offsetsMinutes: [240],
          windowStartMinute: 0,
          windowEndMinute: 1439,
          windowDays: [0, 1, 2, 3, 4, 5, 6],
        },
      });
    });
    after(async () => {
      config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = oldFlags;
      await prisma.callbackTask.deleteMany({ where: { organizationId } });
      await prisma.pendingAction.deleteMany({ where: { organizationId } });
      await prisma.call.updateMany({
        where: { organizationId },
        data: { dispositionId: null },
      });
      await prisma.organization.delete({ where: { id: organizationId } });
      await prisma.user.deleteMany({
        where: { id: { in: [userId, colleagueId] } },
      });
      await prisma.$disconnect();
    });
    async function seed(source = "web") {
      const contact = await prisma.contact.create({
        data: {
          ...ctx,
          name: "Test Contact",
          firstName: "Test",
          phoneNumber: `+1202${Math.floor(Math.random() * 1e7)
            .toString()
            .padStart(7, "0")}`,
        },
      });
      const call = await prisma.call.create({
        data: {
          ...ctx,
          contactId: contact.id,
          source,
          fromNumber: "+12025550100",
          toNumber: contact.phoneNumber,
          direction: "outbound",
          status: "completed",
          answeredAt: new Date(),
          endedAt: new Date(),
        },
      });
      assert.equal(
        await prisma.meeting.count({ where: { contactId: contact.id } }),
        0,
      );
      assert.equal(
        await prisma.aiVoiceAgentHandoff.count({
          where: { contactId: contact.id },
        }),
        0,
      );
      return { contact, call };
    }
    async function enroll() {
      const f = await seed();
      const result = await manual.updateCallOutcome(ctx, f.call.id, {
        outcome: "interested",
      });
      assert.ok(result.followUp);
      const objective = (await repo.followUpSnapshot(result.followUp.id))!;
      assert.equal(objective.state, "scheduled");
      assert.equal(objective.meetingId, null);
      assert.equal(objective.handoffId, null);
      assert.equal(objective.callbacks.length, 1);
      return { ...f, objective, callback: objective.callbacks[0] };
    }
    async function claimAndPrepare(f: Awaited<ReturnType<typeof enroll>>) {
      await prisma.callbackTask.update({
        where: { id: f.callback.id },
        data: { scheduledAt: new Date(Date.now() - 1000) },
      });
      const [claimed] = (
        await callbacks.claimDueAgentCallbacks(
          new Date(),
          new Date(Date.now() + 300000),
          100,
        )
      ).filter((x) => x.id === f.callback.id);
      assert.ok(claimed);
      const callback = (await callbacks.beginAgentDial(
        claimed.id,
        claimed.claimToken!,
        new Date(),
        new Date(Date.now() + 300000),
      ))!;
      const decision = await service.decideHumanCallback(callback);
      assert.equal(decision.action, "dial");
      if (decision.action !== "dial") throw new Error("Not dialable");
      const call = await prisma.call.create({
        data: {
          ...ctx,
          contactId: f.contact.id,
          source: "ai_voice_agent",
          direction: "outbound",
          fromNumber: "+12025550100",
          toNumber: f.contact.phoneNumber,
          status: "pending",
        },
      });
      const agentCall = await prisma.aiVoiceAgentCall.create({
        data: {
          ...ctx,
          agentId,
          callId: call.id,
          contactId: f.contact.id,
          fromNumber: "+12025550100",
          toNumber: f.contact.phoneNumber,
          status: "initiating",
          idempotencyKey: `callback:${callback.id}:${callback.scheduledAt.getTime()}:d${callback.dialTries}`,
        },
      });
      return {
        callback,
        decision,
        placement: { agentCallId: agentCall.id, callId: call.id },
      };
    }
    it("accepts a manual human outcome with zero meetings/handoffs and one policy step", async () => {
      const f = await enroll();
      assert.equal(f.callback.agentCallbackKind, "policy");
      assert.equal(f.objective.timingBasis, "policy");
      await service.reconcileFollowUp(f.objective.id);
      assert.notEqual(
        (await repo.followUpSnapshot(f.objective.id))!.state,
        "closed",
      );
    });
    it("accepts a campaign canonical outcome once and removes the contact from human queues", async () => {
      const f = await seed();
      const campaign = await prisma.campaign.create({
        data: { ...ctx, name: "Campaign fixture" },
      });
      const lead = await prisma.campaignLead.create({
        data: { campaignId: campaign.id, contactId: f.contact.id },
      });
      const attempt = await prisma.callAttempt.create({
        data: {
          campaignId: campaign.id,
          campaignLeadId: lead.id,
          callId: f.call.id,
          agentUserId: userId,
          attemptNumber: 1,
          status: "ended",
          endedAt: new Date(),
        },
      });
      const disposition = await prisma.disposition.create({
        data: {
          campaignId: campaign.id,
          code: "custom_demo",
          label: "Editable label",
          canonicalOutcome: "interested",
          category: "positive",
          triggersCallback: true,
        },
      });
      const leadRepo = new CampaignLeadRepository(db);
      const workflow = Object.assign(
        Object.create(CallAttemptService.prototype),
        {
          logger: { log: () => undefined, warn: () => undefined },
          attemptRepo: new CallAttemptRepository(db),
          campaignLeadRepo: leadRepo,
          callRepo: calls,
          pendingActions: service,
          callbackService: {
            scheduleFromCampaign: () => {
              throw new Error("Duplicate human callback");
            },
          },
          pipelineFanout: { handleCallFinalized: () => undefined },
          crmCallLog: { enqueueOutcomeUpdate: async () => undefined },
          customIntegrationOutbound: {
            enqueueCallOutcomeUpdated: async () => undefined,
          },
          contactService: { addCallNote: async () => undefined },
        },
      ) as CallAttemptService;
      const input = {
        callAttemptId: attempt.id,
        disposition,
        organizationId,
        campaignDefaults: { maxAttempts: 3, retryDelayMin: 60 },
      };
      const results = await Promise.all([
        workflow.submitDisposition(input),
        workflow.submitDisposition(input),
      ]);
      assert.equal(results[0].action, "ai_follow_up");
      assert.equal(results[0].followUp!.id, results[1].followUp!.id);
      const objective = (await repo.followUpSnapshot(results[0].followUp!.id))!;
      assert.equal(objective.callbacks.length, 1);
      assert.equal(
        (
          await prisma.campaignLead.findUniqueOrThrow({
            where: { id: lead.id },
          })
        ).status,
        "completed",
      );
      await prisma.pendingAction.create({
        data: {
          ...ctx,
          contactId: f.contact.id,
          type: "send_follow_up",
          source: "rule",
          title: "Old recommendation",
          contextType: "organization_outside_campaign",
          contextKey: "fixture",
        },
      });
      const humanQueue = await repo.listOpenForCalling(ctx, {
        types: ["send_follow_up"],
        dueBy: new Date(Date.now() + 86400000),
        now: new Date(),
        limit: 100,
      });
      assert.ok(!humanQueue.some((row) => row.contact?.id === f.contact.id));
      const otherCampaign = await prisma.campaign.create({
        data: { ...ctx, name: "Other queue" },
      });
      await prisma.campaignLead.create({
        data: {
          campaignId: otherCampaign.id,
          contactId: f.contact.id,
          status: "queued",
        },
      });
      assert.equal(
        await leadRepo.lockNextLead(
          otherCampaign.id,
          randomUUID(),
          3,
          organizationId,
        ),
        null,
      );
      const blockedContacts = await callbacks.findContactsWithOpenCallback(
        ctx,
        [f.contact.id],
      );
      assert.ok(blockedContacts.has(f.contact.id));
    });
    it("concurrent saves create one objective, step and initiation event; unrelated updates do not revise it", async () => {
      const f = await seed();
      await Promise.all(
        Array.from({ length: 8 }, () =>
          manual.updateCallOutcome(ctx, f.call.id, {
            outcome: "interested",
            outcomeNote: "Arrange a demo",
          }),
        ),
      );
      const objectives = await prisma.pendingActionFollowUp.findMany({
        where: { sourceId: f.call.id },
      });
      assert.equal(objectives.length, 1);
      assert.equal(
        await prisma.callbackTask.count({
          where: { followUpId: objectives[0].id },
        }),
        1,
      );
      assert.equal(
        await prisma.pendingActionFollowUpEvent.count({
          where: { followUpId: objectives[0].id, kind: "objective_initiated" },
        }),
        1,
      );
      const before = await calls.findById(f.call.id);
      await prisma.call.update({
        where: { id: f.call.id },
        data: { durationSeconds: 123 },
      });
      await manual.updateCallOutcome(ctx, f.call.id, {
        outcome: "interested",
        outcomeNote: "Arrange a demo",
      });
      assert.equal(
        (await calls.findById(f.call.id))!.outcomeRevision,
        before!.outcomeRevision,
      );
    });
    it("does not enroll no-answer, voicemail, AI outcomes, historical repeats or disabled policies", async () => {
      for (const outcome of ["no_answer", "voicemail"] as CallOutcome[]) {
        const f = await seed();
        assert.equal(
          (await manual.updateCallOutcome(ctx, f.call.id, { outcome }))
            .followUp,
          undefined,
        );
      }
      const ai = await seed("ai_voice_agent");
      assert.equal(
        (
          await manual.updateCallOutcome(ctx, ai.call.id, {
            outcome: "interested",
          })
        ).followUp,
        undefined,
      );
      const historic = await seed();
      await prisma.call.update({
        where: { id: historic.call.id },
        data: { outcome: "interested" },
      });
      assert.equal(
        (
          await manual.updateCallOutcome(ctx, historic.call.id, {
            outcome: "interested",
          })
        ).followUp,
        undefined,
      );
      config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = [];
      const disabled = await seed();
      assert.equal(
        (
          await manual.updateCallOutcome(ctx, disabled.call.id, {
            outcome: "interested",
          })
        ).followUp,
        undefined,
      );
      config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = [organizationId];
    });
    it("preserves agreed callback date/time zone and blocks an informational purpose honestly", async () => {
      const f = await seed();
      const at = new Date(Date.now() + 86400000).toISOString();
      const r = await manual.updateCallOutcome(ctx, f.call.id, {
        outcome: "callback_scheduled",
        callbackScheduledAt: at,
        callbackTimezone: "America/Santo_Domingo",
        followUpPurpose: "booking",
        outcomeNote: "Discuss the appointment",
      });
      const row = (await repo.followUpSnapshot(r.followUp!.id))!;
      assert.equal(row.callbacks[0].scheduledAt.toISOString(), at);
      assert.equal(row.timingBasis, "agreed");
      assert.equal(
        (row.commitment as { timezone: string }).timezone,
        "America/Santo_Domingo",
      );
      const info = await seed();
      const response = await manual.updateCallOutcome(ctx, info.call.id, {
        outcome: "follow_up",
        outcomeNote: "Explain pricing first",
        followUpPurpose: "information",
      });
      assert.equal(response.followUp!.state, "blocked");
      assert.equal(
        response.followUp!.reason,
        "information_follow_up_not_supported",
      );
      assert.equal(response.followUp!.objective, "Explain pricing first");
      await assert.rejects(
        manual.updateCallOutcome(ctx, (await seed()).call.id, {
          outcome: "callback_scheduled",
        }),
        /callback date/,
      );
    });
    it("keeps a missing specialist blocked with a stored step", async () => {
      await prisma.aiVoiceAgentAutomation.updateMany({
        where: { organizationId },
        data: { agentId: null },
      });
      try {
        const f = await seed();
        const r = await manual.updateCallOutcome(ctx, f.call.id, {
          outcome: "interested",
        });
        assert.equal(r.followUp!.state, "blocked");
        assert.equal(r.followUp!.reason, "specialist_unavailable");
        assert.equal(
          (await repo.followUpSnapshot(r.followUp!.id))!.callbacks.length,
          1,
        );
      } finally {
        await prisma.aiVoiceAgentAutomation.updateMany({
          where: { organizationId },
          data: { agentId },
        });
      }
    });
    it("resumes a blocked assignment after specialist configuration is repaired", async () => {
      await prisma.aiVoiceAgentAutomation.updateMany({
        where: { organizationId },
        data: { agentId: null },
      });
      const f = await seed();
      const accepted = await manual.updateCallOutcome(ctx, f.call.id, {
        outcome: "interested",
      });
      await prisma.aiVoiceAgentAutomation.updateMany({
        where: { organizationId },
        data: { agentId },
      });
      const before = (await repo.followUpSnapshot(accepted.followUp!.id))!;
      await service.controlFollowUp(ctx, before.pendingActionId, {
        operation: "resume",
        expectedRevision: before.revision,
      });
      const objective = (await repo.followUpSnapshot(before.id))!;
      assert.equal(objective.agentId, agentId);
      assert.equal(objective.state, "scheduled");
      await claimAndPrepare({
        ...f,
        objective,
        callback: objective.callbacks[0],
      });
    });
    it("a corrected source cannot book through a previously committed execution", async () => {
      const f = await enroll();
      const p = await claimAndPrepare(f);
      await service.authorizeHumanCallbackDial(
        p.callback,
        p.decision,
        p.placement,
      );
      await manual.updateCallOutcome(ctx, f.call.id, {
        outcome: "not_interested",
      });
      assert.equal(
        await meetings.createIfAvailable(
          ctx,
          {
            contactId: f.contact.id,
            calendarId,
            callId: p.placement.callId,
            agentCallId: p.placement.agentCallId,
            scheduledAt: new Date(Date.now() + 3 * 86400000),
            duration: 30,
            responsibleUserId: userId,
          },
          { calendarId, isDefault: true },
          null,
        ),
        null,
      );
      assert.equal(
        await prisma.meeting.count({ where: { contactId: f.contact.id } }),
        0,
      );
    });
    it("a correction fences dispatch and repeated saves preserve takeover", async () => {
      const f = await enroll();
      const p = await claimAndPrepare(f);
      await manual.updateCallOutcome(ctx, f.call.id, {
        outcome: "not_interested",
      });
      await assert.rejects(
        service.authorizeHumanCallbackDial(p.callback, p.decision, p.placement),
      );
      assert.equal(
        (await callbacks.findById(f.callback.id))!.dispatchCommittedAt,
        null,
      );
      const g = await enroll();
      await service.controlFollowUp(ctx, g.objective.pendingActionId, {
        operation: "take_over",
        expectedRevision: g.objective.revision,
        reason: "I will handle it",
      });
      await manual.updateCallOutcome(ctx, g.call.id, { outcome: "interested" });
      const row = (await repo.followUpSnapshot(g.objective.id))!;
      assert.equal(row.mode, "manual");
      assert.equal(row.state, "paused");
      await assert.rejects(
        service.controlFollowUp(ctx, row.pendingActionId, {
          operation: "resume",
          expectedRevision: row.revision,
        }),
        /explicitly/,
      );
      await service.controlFollowUp(ctx, row.pendingActionId, {
        operation: "return_automatic",
        expectedRevision: row.revision,
      });
      assert.equal((await repo.followUpSnapshot(row.id))!.state, "scheduled");
    });
    it("dispatches without a handoff and resolves only from the exact successful stored reservation", async () => {
      const f = await enroll();
      await meetings.create(ctx, {
        contactId: f.contact.id,
        calendarId,
        scheduledAt: new Date(Date.now() + 86400000),
      });
      await service.reconcileFollowUp(f.objective.id);
      assert.notEqual(
        (await repo.followUpSnapshot(f.objective.id))!.state,
        "resolved",
      );
      const p = await claimAndPrepare({
        ...f,
        objective: (await repo.followUpSnapshot(f.objective.id))!,
      });
      await service.authorizeHumanCallbackDial(
        p.callback,
        p.decision,
        p.placement,
      );
      await prisma.call.update({
        where: { id: p.placement.callId },
        data: { status: "completed", endedAt: new Date() },
      });
      await prisma.aiVoiceAgentCall.update({
        where: { id: p.placement.agentCallId },
        data: {
          status: "completed",
          providerCallControlId: "fixture-" + randomUUID(),
        },
      });
      await callbacks.finishAgentCallback(
        p.callback.id,
        p.callback.claimToken!,
        "completed",
        { now: new Date(), agentCallId: p.placement.agentCallId },
      );
      await service.reconcileFollowUp(f.objective.id);
      assert.notEqual(
        (await repo.followUpSnapshot(f.objective.id))!.state,
        "resolved",
      );
      const meeting = await meetings.createIfAvailable(
        ctx,
        {
          contactId: f.contact.id,
          calendarId,
          callId: p.placement.callId,
          agentCallId: p.placement.agentCallId,
          scheduledAt: new Date(Date.now() + 2 * 86400000),
          duration: 30,
          responsibleUserId: userId,
        },
        { calendarId, isDefault: true },
        null,
      );
      assert.ok(meeting);
      const resolved = (await repo.followUpSnapshot(f.objective.id))!;
      assert.equal(resolved.state, "resolved");
      assert.equal(
        (resolved.resolutionEvidence as { meetingId: string }).meetingId,
        meeting.id,
      );
      assert.equal(
        (resolved.resolutionEvidence as { callbackId: string }).callbackId,
        p.callback.id,
      );
    });
    it("rejects cross-member and cross-workspace outcomes and reads", async () => {
      const f = await enroll();
      await assert.rejects(
        manual.updateCallOutcome({ ...ctx, userId: colleagueId }, f.call.id, {
          outcome: "interested",
        }),
      );
      await assert.rejects(
        service.getFollowUp(
          { ...ctx, userId: colleagueId },
          f.objective.pendingActionId,
        ),
      );
      await assert.rejects(
        manual.updateCallOutcome(
          { userId, organizationId: randomUUID() },
          f.call.id,
          { outcome: "interested" },
        ),
      );
    });
    it("the existing callback executor reconciles an uncertain placement without redial", async () => {
      const f = await enroll();
      const p = await claimAndPrepare(f);
      await service.authorizeHumanCallbackDial(
        p.callback,
        p.decision,
        p.placement,
      );
      let dials = 0;
      const worker = new CallbackService(
        callbacks,
        {} as never,
        {} as never,
        {} as never,
        contacts,
        {} as never,
        agentCalls,
        {
          startCall: async () => {
            dials++;
            throw new Error("Must not dial");
          },
        } as never,
        calls,
        {} as never,
        service,
      );
      // runAgentCallback is the existing lease recovery path; a restarted worker
      // must find the exact key used by agentDialKey before considering a dial.
      await prisma.aiVoiceAgentCall.update({
        where: { id: p.placement.agentCallId },
        data: {
          idempotencyKey: `callback:${p.callback.id}:${p.callback.scheduledAt.getTime()}:d${p.callback.dialTries}`,
        },
      });
      const run = worker as unknown as {
        runAgentCallback: (c: typeof p.callback) => Promise<boolean>;
      };
      await run.runAgentCallback(p.callback);
      assert.equal(dials, 0);
    });
  },
);
