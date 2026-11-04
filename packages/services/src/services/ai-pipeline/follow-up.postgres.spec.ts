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
  OrganizationRepository,
  AiVoiceAgentAutomationRepository,
  AiVoiceAgentRepository,
  CalendarRepository,
  DNCEntryRepository,
  MeetingReminderPolicyRepository,
  AiVoiceAgentCallRepository,
  MeetingReminderExecutionRepository,
  type CallbackTask,
} from "@ringee/database";
import { ComplianceService } from "../outbound/compliance.service";
import { PendingActionService } from "./pending-action.service";
import { CallbackService } from "../outbound/callback.service";
import { VoiceAgentHandoffService } from "../voice-agents/automations/voice-agent-handoff.service";

// Explicit opt-in only. Never inherit the application's database for these tests.
const url = process.env.RINGEE_FOLLOWUP_TEST_DATABASE_URL;
describe(
  "Stage 1 follow-up — real PostgreSQL and domain services",
  { skip: !url },
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
      {} as never,
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
    // One number per seeded contact: a repeated one would see an earlier
    // fixture's live call as the person already being on the phone.
    let phoneSeq = 1000;

    before(async () => {
      assert.ok(
        new URL(url!).hostname === "127.0.0.1" ||
          new URL(url!).hostname === "localhost",
        "Use an isolated local test database",
      );
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
      config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = oldFlags;
      await prisma.pendingAction.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({
        where: { id: { in: [adminId, memberId, colleagueId] } },
      });
      await prisma.$disconnect();
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
      await prisma.call.update({
        where: { id: f.call.id },
        data: { endedAt: new Date(), status: "completed" },
      });
      await prisma.aiVoiceAgentCall.update({
        where: { id: f.agentCall.id },
        data: { status: "completed" },
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
      // Over without a move: now a person decides.
      await prisma.call.update({
        where: { id: f.call.id },
        data: { endedAt: new Date(), status: "completed" },
      });
      await service.reconcileFollowUp(f.objective.id);
      row = (await actions.followUpSnapshot(f.objective.id))!;
      assert.equal(row.state, "blocked");
      assert.equal(row.reason, "reschedule_commit_pending");
      assert.equal(await actions.badgeCount(memberCtx, memberId), 1);
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
      await prisma.call.update({
        where: { id: f.call.id },
        data: { endedAt: new Date(), status: "completed" },
      });
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
      // A meeting cancelled or held during the takeover is not called about again.
      for (const status of ["cancelled", "completed"] as const) {
        await prisma.meeting.update({
          where: { id: f.meeting.id },
          data: { status },
        });
        await assert.rejects(
          service.controlFollowUp(
            memberCtx,
            row.pendingActionId,
            { operation: "return_automatic", expectedRevision: row.revision },
            now,
          ),
          /no longer scheduled/,
          status,
        );
        assert.equal(
          await prisma.callbackTask.count({
            where: {
              handoffId: f.handoff.id,
              status: { in: ["scheduled", "due", "in_progress"] },
            },
          }),
          0,
          status,
        );
      }
      row = (await actions.followUpSnapshot(row.id))!;
      assert.equal(row.mode, "manual");
      await prisma.meeting.update({
        where: { id: f.meeting.id },
        data: { status: "scheduled" },
      });
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
