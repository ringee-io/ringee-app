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
  CustomIntegrationRepository,
  CustomIntegrationDeliveryRepository,
  UserRepository,
  type CallOutcome,
} from "@ringee/database";
import { ComplianceService } from "../outbound/compliance.service";
import { PendingActionService } from "./pending-action.service";
import { MeetingService } from "../meeting.service";
import { CallAttemptService } from "../outbound/call-attempt.service";
import { CallbackService } from "../outbound/callback.service";
import { CustomIntegrationOutboundService } from "../custom-integrations/custom-integration-outbound.service";

const url = process.env.RINGEE_FOLLOWUP_TEST_DATABASE_URL;
describe(
  "Stage 2 human outcomes — disposable PostgreSQL",
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
    const policies = new MeetingReminderPolicyRepository(db);
    const organizations = new OrganizationRepository(db);
    const dnc = new DNCEntryRepository(db);
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
      new ComplianceService(dnc, { enqueue: async () => undefined } as never),
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
    before(async () => {
      assert.ok(["127.0.0.1", "localhost"].includes(new URL(url!).hostname));
      releaseFixture = await isolateFollowUpWorkerFixtures(prisma);
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
      try {
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
      } finally {
        await releaseFixture?.();
        await prisma.$disconnect();
      }
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
    it("scopes callback planning and replay to the verified workspace and call owner", async () => {
      const f = await enroll();
      const p = await claimAndPrepare(f);
      await service.authorizeHumanCallbackDial(
        p.callback,
        p.decision,
        p.placement,
      );
      const emitted: unknown[] = [];
      const workflow = Object.assign(Object.create(CallbackService.prototype), {
        pendingActions: service,
        contactRepo: contacts,
        agentCalls,
        callRepo: calls,
        callbackRepo: callbacks,
        customIntegrationOutbound: {
          enqueue: async (event: unknown) => emitted.push(event),
        },
      }) as CallbackService;
      const input = {
        ...ctx, // Supplied identity fields must never override the verified ctx.
        ...p.placement,
        contactId: f.contact.id,
        scheduledAt: new Date(Date.now() + 86400000),
      };
      const before = (await repo.followUpSnapshot(f.objective.id))!;
      const outsiders = [
        { ...ctx, organizationId: randomUUID() },
        { ...ctx, organizationId: null },
        { ...ctx, userId: colleagueId },
      ];
      for (const owner of outsiders) {
        await assert.rejects(
          workflow.scheduleFromVoiceAgent(owner, input),
          /Callback source not found/,
        );
        assert.equal(
          await repo.followUpForAgentCall(owner, p.placement.agentCallId),
          null,
        );
        assert.equal(
          await repo.planHumanFollowUpStep(
            owner,
            before.id,
            before.revision,
            input.scheduledAt,
            "agreed",
            p.placement.agentCallId,
          ),
          null,
        );
      }
      const other = await seed();
      for (const changed of [
        { contactId: other.contact.id },
        { callId: other.call.id },
      ]) {
        await assert.rejects(
          workflow.scheduleFromVoiceAgent(ctx, { ...input, ...changed }),
          /Callback source not found/,
        );
      }
      // The linked action and callback are independently scoped in persistence.
      await prisma.pendingAction.update({
        where: { id: before.pendingActionId },
        data: { userId: colleagueId },
      });
      await assert.rejects(
        workflow.scheduleFromVoiceAgent(ctx, input),
        /Follow-up not found/,
      );
      assert.equal(
        await repo.planHumanFollowUpStep(
          ctx,
          before.id,
          before.revision,
          input.scheduledAt,
          "agreed",
          p.placement.agentCallId,
        ),
        null,
      );
      await prisma.pendingAction.update({
        where: { id: before.pendingActionId },
        data: { userId },
      });
      await prisma.callbackTask.update({
        where: { id: p.callback.id },
        data: { userId: colleagueId },
      });
      assert.equal(
        await repo.planHumanFollowUpStep(
          ctx,
          before.id,
          before.revision,
          input.scheduledAt,
          "agreed",
          p.placement.agentCallId,
        ),
        null,
      );
      await prisma.callbackTask.update({
        where: { id: p.callback.id },
        data: { userId },
      });
      const unchanged = (await repo.followUpSnapshot(f.objective.id))!;
      assert.equal(unchanged.revision, before.revision);
      assert.equal(unchanged.callbacks.length, before.callbacks.length);
      assert.deepEqual(emitted, []);
      const accepted = await workflow.scheduleFromVoiceAgent(ctx, input);
      assert.equal(
        accepted.callId,
        f.call.id,
        "the objective retains its original human call",
      );
      for (const owner of outsiders) {
        assert.equal(
          await repo.planHumanFollowUpStep(
            owner,
            before.id,
            before.revision,
            input.scheduledAt,
            "agreed",
            p.placement.agentCallId,
          ),
          null,
        );
      }
      const replay = await workflow.scheduleFromVoiceAgent(ctx, input);
      assert.equal(replay.id, accepted.id);
    });

    it("publishes an agreed human-objective callback once across tool replays", async () => {
      const f = await enroll();
      const p = await claimAndPrepare(f);
      await service.authorizeHumanCallbackDial(
        p.callback,
        p.decision,
        p.placement,
      );
      const integration = await prisma.customIntegration.create({
        data: {
          ...ctx,
          name: "Callback events",
          apiKeyPrefix: randomUUID(),
          apiKeyHash: randomUUID(),
          webhookSigningSecretCt: "fixture",
          outboundUrl: "https://example.invalid/events",
          subscribedEvents: ["callback_created"],
        },
      });
      const workflow = Object.assign(Object.create(CallbackService.prototype), {
        pendingActions: service,
        contactRepo: contacts,
        agentCalls,
        callRepo: calls,
        callbackRepo: callbacks,
        customIntegrationOutbound: new CustomIntegrationOutboundService(
          new CustomIntegrationRepository(db),
          new CustomIntegrationDeliveryRepository(db),
          agentCalls,
          new UserRepository(db, {} as never),
          agents,
          calls,
        ),
      }) as CallbackService;
      try {
        const input = {
          ...ctx,
          ...p.placement,
          contactId: f.contact.id,
          scheduledAt: new Date(Date.now() + 86400000),
        };
        const first = await workflow.scheduleFromVoiceAgent(ctx, input);
        const [delivery] = await prisma.customIntegrationDelivery.findMany({
          where: { integrationId: integration.id },
        });
        assert.ok(
          delivery,
          "publication completes before the scheduling response",
        );
        assert.equal(delivery.subjectId, first.id);
        assert.equal(delivery.eventType, "callback_created");
        await prisma.customIntegrationDelivery.update({
          where: { id: delivery.id },
          data: { status: "sent" },
        });
        const replay = await workflow.scheduleFromVoiceAgent(ctx, input);
        assert.equal(replay.id, first.id);
        assert.equal(
          await prisma.customIntegrationDelivery.count({
            where: { integrationId: integration.id },
          }),
          1,
        );
        assert.equal(
          (
            await prisma.customIntegrationDelivery.findUniqueOrThrow({
              where: { id: delivery.id },
            })
          ).status,
          "sent",
        );
      } finally {
        await prisma.customIntegration.delete({
          where: { id: integration.id },
        });
      }
    });
    it("pages the human queue while excluding another member's active contact objective", async () => {
      const assigned = await enroll();
      await prisma.pendingAction.update({
        where: { id: assigned.objective.pendingActionId },
        data: { userId: colleagueId },
      });
      const available = await Promise.all([seed(), seed()]);
      const ids: string[] = [];
      for (const [index, f] of [assigned, ...available].entries()) {
        const action = await prisma.pendingAction.create({
          data: {
            ...ctx,
            contactId: f.contact.id,
            type: "ask_for_referral",
            source: "rule",
            title: "Queue fixture",
            contextType: "organization_outside_campaign",
            contextKey: "fixture",
            dueAt: index === 2 ? null : new Date(Date.now() - 1000),
          },
        });
        ids.push(action.id);
      }
      const options = {
        types: ["ask_for_referral" as const],
        dueBy: new Date(),
        now: new Date(),
        limit: 1,
      };
      const first = await repo.listOpenForCalling(ctx, options);
      assert.deepEqual(
        first.map((row) => row.id),
        [ids[1]],
      );
      const second = await repo.listOpenForCalling(ctx, {
        ...options,
        after: first[0].id,
      });
      assert.deepEqual(
        second.map((row) => row.id),
        [ids[2]],
      );
      assert.deepEqual(
        await repo.listOpenForCalling(ctx, { ...options, after: second[0].id }),
        [],
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
      const acceptedCall = (await calls.findById(f.call.id))!;
      const another = await prisma.disposition.create({
        data: {
          campaignId: campaign.id,
          code: "another_demo",
          label: "Another label",
          canonicalOutcome: "interested",
          category: "positive",
        },
      });
      const corrected = await calls.recordOutcome(
        f.call.id,
        "interested",
        undefined,
        { id: another.id, name: another.label },
      );
      assert.equal(
        corrected.call.outcomeRevision,
        acceptedCall.outcomeRevision,
      );
      const rejected = await new CallAttemptRepository(db).setDisposition(
        attempt.id,
        {
          dispositionId: disposition.id,
          dispositionCode: disposition.code,
          dispositionOutcome: "interested",
        },
        { callId: f.call.id, revision: acceptedCall.outcomeRevision },
      );
      assert.equal(
        rejected,
        null,
        "a disposition-only correction must fence stale campaign acceptance",
      );
      assert.equal(
        (await calls.findById(f.call.id))!.dispositionId,
        another.id,
      );
    });
    it("increments the semantic revision once for a changed custom-disposition note, never for disposition alone", async () => {
      const f = await seed();
      const custom = await prisma.disposition.create({
        data: {
          ...ctx,
          code: "custom_note",
          label: "Custom",
          category: "neutral",
        },
      });
      const disposition = { id: custom.id, name: custom.label };
      const initial = await calls.recordDispositionWithoutOutcome(
        f.call.id,
        disposition,
      );
      assert.equal(initial.outcomeRevision, 0);
      await Promise.all(
        Array.from({ length: 4 }, () =>
          calls.recordDispositionWithoutOutcome(
            f.call.id,
            disposition,
            "New commitment",
          ),
        ),
      );
      const noted = (await calls.findById(f.call.id))!;
      assert.equal(noted.outcomeRevision, 1);
      assert.equal(noted.outcomeNote, "New commitment");
      const renamed = await calls.recordDispositionWithoutOutcome(
        f.call.id,
        { ...disposition, name: "Renamed" },
        "New commitment",
      );
      assert.equal(renamed.outcomeRevision, 1);
      const cleared = await calls.recordDispositionWithoutOutcome(
        f.call.id,
        disposition,
        "",
      );
      assert.equal(cleared.outcomeRevision, 2);
      assert.equal(cleared.outcomeNote, "");
    });
    it("merges scheduling policy against the current locked automation across concurrent saves", async () => {
      const automations = new AiVoiceAgentAutomationRepository(db);
      const before = (await automations.findForOwner(
        ctx,
        "appointment_booking",
      ))!;
      let entered!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const first = automations.upsertForOwner(
        ctx,
        "appointment_booking",
        () => {
          entered();
          return {
            agentId,
            enabled: true,
            settings: {
              humanFollowUp: {
                enabled: true,
                interestedObjective: "information",
              },
            },
          };
        },
      );
      try {
        await ready;
        const second = automations.upsertForOwner(
          ctx,
          "appointment_booking",
          (current) => ({
            agentId,
            enabled: true,
            settings: current!.settings!,
          }),
        );
        await Promise.all([first, second]);
        const current = (await automations.findForOwner(
          ctx,
          "appointment_booking",
        ))!;
        assert.equal(
          (
            current.settings as {
              humanFollowUp: { interestedObjective: string };
            }
          ).humanFollowUp.interestedObjective,
          "information",
        );
      } finally {
        await first;
        await automations.upsertForOwner(ctx, "appointment_booking", {
          agentId,
          enabled: true,
          settings: before.settings!,
        });
      }
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
    it("does not enroll no-answer, voicemail, AI outcomes, historical repeats or pilot-off outcomes", async () => {
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
    it("saves interested without enrollment when the stored policy is disabled in a piloted organization", async () => {
      const automation = await prisma.aiVoiceAgentAutomation.findFirstOrThrow({
        where: { organizationId },
      });
      await prisma.aiVoiceAgentAutomation.update({
        where: { id: automation.id },
        data: {
          settings: {
            humanFollowUp: { enabled: false, interestedObjective: "booking" },
          },
        },
      });
      try {
        assert.ok(
          config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS.includes(organizationId),
        );
        const f = await seed();
        const result = await manual.updateCallOutcome(ctx, f.call.id, {
          outcome: "interested",
        });
        assert.equal(result.followUp, undefined);
        assert.equal((await calls.findById(f.call.id))!.outcome, "interested");
        assert.equal(
          await prisma.pendingActionFollowUp.count({
            where: { sourceId: f.call.id },
          }),
          0,
        );
      } finally {
        await prisma.aiVoiceAgentAutomation.update({
          where: { id: automation.id },
          data: { settings: automation.settings! },
        });
      }
    });
    it("closes the source objective and withdraws its callback when booking records an outcome without assignment", async () => {
      const f = await enroll();
      const result = await calls.recordOutcome(f.call.id, "meeting_booked");
      assert.equal(result.followUp!.state, "closed");
      assert.equal(result.followUp!.reason, "source_outcome_corrected");
      assert.equal(
        (await callbacks.findById(f.callback.id))!.status,
        "cancelled",
      );
      const revision = result.followUp!.revision;
      await calls.recordOutcome(f.call.id, "meeting_booked");
      assert.equal(
        (await repo.followUpSnapshot(f.objective.id))!.revision,
        revision,
      );
    });
    it("gives an unplaced recovery a new key on the next review and replays the same attempt", async () => {
      const f = await enroll();
      await prisma.callbackTask.update({
        where: { id: f.callback.id },
        data: { status: "missed", reason: "not_placed" },
      });
      const at = new Date(Date.now() + 86400000);
      const first = (await repo.planHumanFollowUpStep(
        ctx,
        f.objective.id,
        f.objective.revision,
        at,
        "recovery",
      ))!;
      assert.ok(first);
      assert.equal(
        (await repo.planHumanFollowUpStep(
          ctx,
          f.objective.id,
          f.objective.revision,
          at,
          "recovery",
        ))!.id,
        first.id,
      );
      await prisma.callbackTask.update({
        where: { id: first.id },
        data: { status: "missed", reason: "not_placed" },
      });
      const row = (await repo.followUpSnapshot(f.objective.id))!;
      assert.equal(row.recoveryCount, 0);
      const second = (await repo.planHumanFollowUpStep(
        ctx,
        row.id,
        row.revision,
        at,
        "recovery",
      ))!;
      assert.ok(second);
      assert.notEqual(second.id, first.id);
      assert.notEqual(second.agentCallbackKey, first.agentCallbackKey);
      assert.equal(
        (await repo.planHumanFollowUpStep(
          ctx,
          row.id,
          row.revision,
          at,
          "recovery",
        ))!.id,
        second.id,
      );
    });
    it("commits stop and DNC together, tolerates a duplicate phone and rolls back unrelated failures", async () => {
      const f = await enroll();
      const before = (await calls.findById(f.call.id))!;
      const createOnce = dnc.createOnce.bind(dnc);
      dnc.createOnce = async (...args) => {
        await createOnce(...args);
        throw new Error("injected persistence failure");
      };
      try {
        await assert.rejects(
          manual.updateCallOutcome(ctx, f.call.id, {
            outcome: "not_interested",
            stopRequested: true,
          }),
          /injected persistence failure/,
        );
        assert.equal(await dnc.findByPhone(ctx, f.contact.phoneNumber), null);
        assert.equal(
          (await calls.findById(f.call.id))!.outcomeRevision,
          before.outcomeRevision,
        );
        assert.equal(
          (await repo.followUpSnapshot(f.objective.id))!.state,
          "scheduled",
        );
        assert.equal(
          (await callbacks.findById(f.callback.id))!.status,
          "scheduled",
        );
      } finally {
        dnc.createOnce = createOnce;
      }
      // A colleague's entry on the same org list also satisfies the stop.
      const existing = await dnc.create({
        ...ctx,
        userId: colleagueId,
        phoneNumber: f.contact.phoneNumber,
      });
      for (let replay = 0; replay < 2; replay++) {
        const result = await manual.updateCallOutcome(ctx, f.call.id, {
          outcome: "not_interested",
          stopRequested: true,
        });
        assert.equal(result.followUp!.state, "closed");
      }
      assert.equal(
        (await dnc.findByPhone(ctx, f.contact.phoneNumber))!.id,
        existing.id,
      );
      assert.equal(
        (await calls.findById(f.call.id))!.outcomeRevision,
        before.outcomeRevision + 1,
      );
      assert.equal(
        (
          (await calls.findById(f.call.id))!.outcomeCommitment as {
            stopRequested: boolean;
          }
        ).stopRequested,
        true,
      );
    });
    it("records stop and the actual remote number for personal, unknown-contact, unattributed and AI calls", async () => {
      await prisma.organizationMembership.updateMany({
        where: { ...ctx },
        data: { role: "org:admin" },
      });
      const personal = { userId, organizationId: null };
      try {
        for (const variant of [
          "personal",
          "unknown",
          "unattributed",
          "ai",
        ] as const) {
          const f = await seed(variant === "ai" ? "ai_voice_agent" : "web");
          const owner = variant === "personal" ? personal : ctx;
          await prisma.call.update({
            where: { id: f.call.id },
            data: {
              organizationId: owner.organizationId,
              userId: variant === "unattributed" ? null : userId,
              contactId: variant === "ai" ? f.contact.id : null,
              direction: "inbound",
              fromNumber: f.contact.phoneNumber,
              toNumber: "+12025550100",
            },
          });
          try {
            for (let replay = 0; replay < 2; replay++) {
              const result = await service.recordHumanOutcome(
                owner,
                f.call.id,
                { outcome: "not_interested", stopRequested: true },
              );
              assert.equal(result.followUp, null);
              assert.equal(
                (result.call.outcomeCommitment as { stopRequested: boolean })
                  .stopRequested,
                true,
              );
            }
            assert.ok(await dnc.findByPhone(owner, f.contact.phoneNumber));
            assert.equal(await dnc.findByPhone(owner, "+12025550100"), null);
          } finally {
            if (variant === "personal") {
              await prisma.call.delete({ where: { id: f.call.id } });
              await dnc.deleteByPhone(owner, f.contact.phoneNumber);
            }
          }
        }
      } finally {
        await prisma.organizationMembership.updateMany({
          where: { ...ctx },
          data: { role: "org:member" },
        });
      }
    });
    it("rejects ambiguous and impossible timestamps in the shared outcome service before writing", async () => {
      const f = await seed();
      for (const callbackAt of [
        "2030-01-02",
        "2030-01-02T10:30:00",
        "January 2, 2030 10:30:00 GMT",
        "2030-02-30T10:30:00Z",
        "2030-02-29T10:30:00-04:00",
        "2030-01-02T10:30:00+25:00",
        "",
      ]) {
        await assert.rejects(
          service.recordHumanOutcome(ctx, f.call.id, {
            outcome: "callback_scheduled",
            callbackAt,
          }),
          /valid callback date/,
        );
      }
      assert.equal((await calls.findById(f.call.id))!.outcome, null);
      assert.equal(
        await prisma.pendingAction.count({ where: { callId: f.call.id } }),
        0,
      );
      const personal = await prisma.call.create({
        data: {
          userId,
          organizationId: null,
          source: "web",
          direction: "outbound",
          fromNumber: "+12025550100",
          toNumber: "+12025550101",
        },
      });
      await assert.rejects(
        service.recordHumanOutcome(
          { userId, organizationId: null },
          personal.id,
          {
            outcome: "callback_scheduled",
            callbackAt: "2030-01-02T10:30:00",
          },
        ),
        /valid callback date/,
      );
      await prisma.call.delete({ where: { id: personal.id } });
      const callbackAt = new Date(Date.now() + 86400000)
        .toISOString()
        .replace("Z", "-04:00");
      const accepted = await service.recordHumanOutcome(ctx, f.call.id, {
        outcome: "callback_scheduled",
        callbackAt,
        purpose: "booking",
      });
      const row = (await repo.followUpSnapshot(accepted.followUp!.id))!;
      assert.equal(
        row.callbacks[0].scheduledAt.toISOString(),
        new Date(callbackAt).toISOString(),
      );
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
    it("attributes an administrator correction to its authenticated actor while keeping the commercial owner", async () => {
      const f = await enroll();
      await prisma.organizationMembership.updateMany({
        where: { organizationId, userId: colleagueId },
        data: { role: "org:admin" },
      });
      try {
        await manual.updateCallOutcome(
          { ...ctx, userId: colleagueId },
          f.call.id,
          { outcome: "not_interested" },
        );
        const closed = (await repo.followUpSnapshot(f.objective.id))!;
        assert.equal(closed.responsibleUserId, userId);
        const event = await prisma.pendingActionFollowUpEvent.findFirstOrThrow({
          where: { followUpId: closed.id, kind: "objective_closed" },
        });
        assert.equal(event.actorId, colleagueId);
      } finally {
        await prisma.organizationMembership.updateMany({
          where: { organizationId, userId: colleagueId },
          data: { role: "org:member" },
        });
      }
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
