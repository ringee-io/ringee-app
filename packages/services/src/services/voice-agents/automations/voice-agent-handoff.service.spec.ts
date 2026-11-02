/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiVoiceAgentHandoffRequestStatus,
  AiVoiceAgentHandoffStatus,
  AiVoiceAgentParticipantRole,
  AiVoiceAgentParticipantStatus,
  CallbackAgentKind,
  CallbackStatus,
  MeetingStatus,
} from "@ringee/database";
import { VoiceAgentToolService } from "../voice-agent-tool.service";
import { VoiceAgentHandoffService } from "./voice-agent-handoff.service";

const config = apiConfiguration as unknown as Record<string, unknown>;
config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-1", "org-2"];

const H = AiVoiceAgentHandoffStatus;
const R = AiVoiceAgentHandoffRequestStatus;

const REM_SECRET = "rva_reminders";
const SCHED_SECRET = "rva_scheduling";
const FOREIGN_SECRET = "rva_foreign";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** 2026-11-03 10:00 Madrid: inside the default calling window. */
const NOW = new Date("2026-11-03T09:00:00.000Z");
const MEETING_AT = new Date("2026-11-03T15:00:00.000Z");

type Row = Record<string, any>;

/**
 * An in-memory organization: two agents, a meeting a reminder call is about,
 * and the call itself — with repositories that keep the same compare-and-set
 * semantics as the Prisma ones, so a flow can be driven end to end.
 */
function world(
  over: {
    automation?: Row | null;
    scheduling?: Partial<Row>;
    meeting?: Partial<Row>;
    call?: Partial<Row>;
    policyWindow?: {
      windowStartMinute: number;
      windowEndMinute: number;
      windowDays: number[];
    };
  } = {},
) {
  const agents = new Map<string, Row>();
  agents.set("agent-rem", {
    id: "agent-rem",
    name: "Sofía",
    type: "reminders_notifications",
    status: "active",
    userId: "admin-1",
    organizationId: "org-1",
    voiceLanguage: "es",
    providerAssistantId: "asst-rem",
    toolSecretHash: hash(REM_SECRET),
    deletedAt: null,
    meetingDurationMinutes: 30,
    calendarId: null,
    calendarIntegrationId: null,
  });
  agents.set("agent-sched", {
    id: "agent-sched",
    name: "Carmen",
    type: "appointment_booking",
    status: "active",
    userId: "admin-1",
    organizationId: "org-1",
    voiceLanguage: "es",
    providerAssistantId: "asst-sched",
    toolSecretHash: hash(SCHED_SECRET),
    deletedAt: null,
    meetingDurationMinutes: 30,
    // Its own booking calendar — never the one a moved meeting is read from.
    calendarId: "cal-agent",
    calendarIntegrationId: null,
    ...over.scheduling,
  });
  agents.set("agent-foreign", {
    id: "agent-foreign",
    name: "Other",
    type: "appointment_booking",
    status: "active",
    userId: "admin-2",
    organizationId: "org-2",
    voiceLanguage: "es",
    providerAssistantId: "asst-foreign",
    toolSecretHash: hash(FOREIGN_SECRET),
    deletedAt: null,
    meetingDurationMinutes: 30,
    calendarId: null,
    calendarIntegrationId: null,
  });

  const automation =
    over.automation === undefined
      ? {
          id: "auto-1",
          organizationId: "org-1",
          capability: "appointment_booking",
          agentId: "agent-sched",
          enabled: true,
        }
      : over.automation;

  const contact = {
    id: "contact-1",
    organizationId: "org-1",
    userId: "admin-1",
    phoneNumber: "+34600111222",
    firstName: "Ana",
    lastName: "López",
    name: "Ana López",
    fullName: "Ana López",
    email: "ana@example.com",
    deletedAt: null,
  };
  const meetings = new Map<string, Row>();
  meetings.set("meeting-1", {
    id: "meeting-1",
    organizationId: "org-1",
    userId: "admin-1",
    contactId: "contact-1",
    callId: "booking-call",
    calendarId: "cal-meeting",
    title: "Demo",
    scheduledAt: MEETING_AT,
    duration: 45,
    status: MeetingStatus.scheduled,
    scheduleVersion: 3,
    responsibleUserId: "member-1",
    attendanceStatus: "declined",
    attendanceAgentCallId: "ac-1",
    leadEmail: "ana@example.com",
    contact,
    ...over.meeting,
  });

  const calls = new Map<string, Row>();
  calls.set("call-1", {
    id: "call-1",
    organizationId: "org-1",
    status: "answered",
    endedAt: null,
    answeredAt: new Date(NOW.getTime() - 60_000),
    startedAt: new Date(NOW.getTime() - 120_000),
    createdAt: new Date(NOW.getTime() - 120_000),
    ...over.call,
  });
  const agentCalls = new Map<string, Row>();
  agentCalls.set("ac-1", {
    id: "ac-1",
    agentId: "agent-rem",
    userId: "admin-1",
    organizationId: "org-1",
    callId: "call-1",
    contactId: "contact-1",
    toNumber: "+34600111222",
    providerCallControlId: "v3:cc-1",
    status: "in_progress",
    idempotencyKey: "meeting:meeting-1:v3:p:a1:d1",
    variables: {},
  });

  const handoffs = new Map<string, Row>();
  const participants: Row[] = [];
  const callbacks = new Map<string, Row>();
  const offers: Row[] = [];

  const clone = <T>(row: T): T => (row ? { ...row } : row);

  const handoffRepo = {
    findById: async (id: string) => clone(handoffs.get(id) ?? null),
    findByIdempotencyKey: async (key: string) =>
      clone(
        [...handoffs.values()].find((h) => h.idempotencyKey === key) ?? null,
      ),
    findForAgentCall: async (agentCallId: string) =>
      clone(
        [...handoffs.values()]
          .filter((h) => h.agentCallId === agentCallId)
          .at(-1) ?? null,
      ),
    createOnce: async (input: Row) => {
      const existing = [...handoffs.values()].find(
        (h) => h.idempotencyKey === input.idempotencyKey,
      );
      if (existing) return { handoff: clone(existing), created: false };
      const row = {
        id: randomUUID(),
        ...input,
        recoveryAttempts: 0,
        offeredSlots: null,
        offeredAt: null,
        offeredAgentCallId: null,
        preparedAt: NOW,
        completedAt: null,
        failedAt: null,
        reconciledAt: null,
        resolvedAt: null,
        lastError: null,
        failureReason: input.failureReason ?? null,
        resolution: input.resolution ?? null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      handoffs.set(row.id, row);
      if (input.status === H.prepared) {
        participants.push({
          id: randomUUID(),
          organizationId: input.organizationId,
          agentCallId: input.agentCallId,
          agentId: input.sourceAgentId,
          handoffId: row.id,
          role: AiVoiceAgentParticipantRole.initial,
          status: AiVoiceAgentParticipantStatus.active,
          sequence: 1,
          meetingId: input.meetingId,
          meetingScheduleVersion: input.meetingScheduleVersion,
          calendarId: input.calendarId,
          endedAt: null,
        });
      }
      return { handoff: clone(row), created: true };
    },
    activate: async (
      handoffId: string,
      destination: { agentId: string; binding: Row; now: Date },
    ) => {
      const handoff = handoffs.get(handoffId);
      if (!handoff) return { result: "not_found", handoff: null };
      if (handoff.destinationAgentId !== destination.agentId) {
        return { result: "other_destination", handoff: clone(handoff) };
      }
      const existing = participants.find(
        (p) =>
          p.agentCallId === handoff.agentCallId &&
          p.agentId === destination.agentId,
      );
      if (handoff.status === H.completed && existing) {
        return {
          result: "already_active",
          handoff: clone(handoff),
          participant: clone(existing),
        };
      }
      if (![H.prepared, H.uncertain].includes(handoff.status)) {
        return { result: "not_activatable", handoff: clone(handoff) };
      }
      handoff.status = H.completed;
      handoff.completedAt = destination.now;
      for (const p of participants) {
        if (
          p.agentCallId === handoff.agentCallId &&
          p.role === AiVoiceAgentParticipantRole.initial &&
          p.status === AiVoiceAgentParticipantStatus.active
        ) {
          p.status = AiVoiceAgentParticipantStatus.handed_off;
          p.endedAt = destination.now;
        }
      }
      const participant = {
        id: randomUUID(),
        organizationId: handoff.organizationId,
        agentCallId: handoff.agentCallId,
        agentId: destination.agentId,
        handoffId: handoff.id,
        role: AiVoiceAgentParticipantRole.handoff,
        status: AiVoiceAgentParticipantStatus.active,
        sequence: 2,
        ...destination.binding,
        endedAt: null,
      };
      participants.push(participant);
      return {
        result: "activated",
        handoff: clone(handoff),
        participant: clone(participant),
      };
    },
    failLive: async (id: string, from: string[], data: Row) => {
      const handoff = handoffs.get(id);
      if (!handoff || !from.includes(handoff.status)) return false;
      handoff.status = H.failed;
      handoff.failureReason = data.failureReason;
      handoff.failedAt = data.now;
      return true;
    },
    markUncertain: async (id: string) => {
      const handoff = handoffs.get(id);
      if (handoff?.status !== H.prepared) return false;
      handoff.status = H.uncertain;
      return true;
    },
    recordOffer: async (id: string, data: Row) => {
      offers.push({ id, ...data });
      const handoff = handoffs.get(id)!;
      handoff.offeredSlots = data.slots;
      handoff.offeredAt = data.now;
      handoff.offeredAgentCallId = data.agentCallId;
    },
    settleRequest: async (id: string, status: string, resolution: string) => {
      const handoff = handoffs.get(id);
      if (handoff?.requestStatus !== R.pending) return false;
      handoff.requestStatus = status;
      handoff.resolution = resolution;
      return true;
    },
    scheduleReview: async (id: string, at: Date) => {
      const handoff = handoffs.get(id);
      if (handoff?.requestStatus === R.pending) handoff.reviewAt = at;
    },
    markRecoveryPlanned: async (
      id: string,
      expected: number,
      reviewAt: Date,
    ) => {
      const handoff = handoffs.get(id);
      if (
        handoff?.requestStatus !== R.pending ||
        handoff.recoveryAttempts !== expected
      ) {
        return false;
      }
      handoff.recoveryAttempts += 1;
      handoff.reviewAt = reviewAt;
      return true;
    },
    listDueForReview: async (now: Date) =>
      [...handoffs.values()]
        .filter(
          (h) =>
            h.requestStatus === R.pending &&
            h.reviewAt.getTime() <= now.getTime(),
        )
        .map(clone),
    findParticipant: async (agentCallId: string, agentId: string) =>
      clone(
        participants.find(
          (p) => p.agentCallId === agentCallId && p.agentId === agentId,
        ) ?? null,
      ),
    listParticipants: async (agentCallId: string) =>
      participants.filter((p) => p.agentCallId === agentCallId).map(clone),
    createCallbackParticipant: async (input: Row) => {
      const existing = participants.find(
        (p) =>
          p.agentCallId === input.agentCallId && p.agentId === input.agentId,
      );
      if (existing) return clone(existing);
      const participant = {
        id: randomUUID(),
        organizationId: input.organizationId,
        agentCallId: input.agentCallId,
        agentId: input.agentId,
        handoffId: input.handoffId,
        role: AiVoiceAgentParticipantRole.callback,
        status: AiVoiceAgentParticipantStatus.active,
        sequence: 1,
        ...input.binding,
        endedAt: null,
      };
      participants.push(participant);
      return clone(participant);
    },
    endActiveParticipants: async (agentCallId: string, now: Date) => {
      for (const p of participants) {
        if (
          p.agentCallId === agentCallId &&
          p.status === AiVoiceAgentParticipantStatus.active
        ) {
          p.status = AiVoiceAgentParticipantStatus.ended;
          p.endedAt = now;
        }
      }
    },
  };

  const callbackRepo = {
    listForHandoff: async (handoffId: string) =>
      [...callbacks.values()]
        .filter((c) => c.handoffId === handoffId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(clone),
    cancelOpenForHandoff: async (handoffId: string, reason: string) => {
      let count = 0;
      for (const c of callbacks.values()) {
        if (
          c.handoffId === handoffId &&
          [CallbackStatus.scheduled, CallbackStatus.due].includes(c.status)
        ) {
          c.status = CallbackStatus.cancelled;
          c.reason = reason;
          count++;
        }
      }
      return count;
    },
    findById: async (id: string) => clone(callbacks.get(id) ?? null),
  };

  const sameOrg = (ctx: Row, row: Row | undefined | null) =>
    row && row.organizationId === ctx.organizationId ? row : null;

  const handoffService = new VoiceAgentHandoffService(
    handoffRepo as never,
    {
      findForOwner: async (ctx: Row) =>
        automation && automation.organizationId === ctx.organizationId
          ? { ...automation }
          : null,
    } as never,
    {
      findByIdForOwner: async (ctx: Row, id: string) => {
        const agent = sameOrg(ctx, agents.get(id));
        return agent && !agent.deletedAt ? { ...agent } : null;
      },
    } as never,
    {
      findById: async (id: string) => clone(agentCalls.get(id) ?? null),
      hasLiveCallToNumber: async () => false,
    } as never,
    {
      findById: async (id: string) => clone(calls.get(id) ?? null),
      hasActiveWithNumber: async () => false,
    } as never,
    {
      findById: async (id: string) => clone(meetings.get(id) ?? null),
    } as never,
    {
      findByAgentCallId: async (agentCallId: string) =>
        agentCallId === "ac-1"
          ? {
              id: "exec-1",
              agentCallId: "ac-1",
              organizationId: "org-1",
              meetingId: "meeting-1",
              scheduleVersion: 3,
            }
          : null,
    } as never,
    {
      findForCalendar: async () =>
        over.policyWindow ? over.policyWindow : null,
    } as never,
    {
      findByIdForOwner: async (_ctx: Row, id: string) =>
        id === "cal-meeting"
          ? { id, timezone: "Europe/Madrid" }
          : id === "cal-global"
            ? { id, timezone: "UTC" }
            : null,
      findDefault: async () => ({ id: "cal-global", timezone: "UTC" }),
    } as never,
    {
      resolveCalendar: async (_ctx: Row, opts: Row) => ({
        calendar: {
          id: opts.calendarId ?? "cal-global",
          timezone: "Europe/Madrid",
          isDefault: !opts.calendarId,
        },
        scope: {
          calendarId: opts.calendarId ?? "cal-global",
          isDefault: false,
        },
        timezone: "Europe/Madrid",
        destination: null,
      }),
    } as never,
    {
      findByIdForOwner: async (ctx: Row, id: string) =>
        id === contact.id && ctx.organizationId === contact.organizationId
          ? { ...contact }
          : null,
    } as never,
    {
      findById: async (id: string) =>
        id === "member-1"
          ? { id, firstName: "Carlos", lastName: "Ruiz" }
          : null,
    } as never,
    callbackRepo as never,
    { assistantHandoffMode: () => "assistant_tool" } as never,
    { previousInteractions: async () => "" } as never,
  );

  return {
    agents,
    meetings,
    calls,
    agentCalls,
    handoffs,
    participants,
    callbacks,
    offers,
    handoffService,
    endCall(id = "call-1", at = new Date(NOW.getTime() + 60_000)) {
      const call = calls.get(id)!;
      call.status = "completed";
      call.endedAt = at;
    },
  };
}

/** The tool service, driven by the real handoff service and the world. */
function tools(w: ReturnType<typeof world>) {
  const slotLookups: Row[] = [];
  const created: Row[] = [];
  const supports: Row[] = [];
  const outcomes: Row[] = [];
  const agentCallbacks: Row[] = [];
  const legacyCallbacks: Row[] = [];
  const attendance: Row[] = [];

  const service = new VoiceAgentToolService(
    {
      findByIdForToolCallback: async (id: string) =>
        w.agents.get(id) ? { ...w.agents.get(id)! } : null,
    } as never,
    {
      findByCallControlId: async (controlId: string) =>
        [...w.agentCalls.values()].find(
          (call) => call.providerCallControlId === controlId,
        ) ?? null,
      update: async () => ({}),
      findById: async (id: string) => w.agentCalls.get(id) ?? null,
      pinCalendarIfUnset: async () => null,
    } as never,
    {
      resolveCalendar: async (_ctx: Row, opts: Row) => ({
        calendar: { id: opts.calendarId ?? "cal-agent", timezone: "UTC" },
        scope: { calendarId: opts.calendarId ?? "cal-agent", isDefault: false },
        timezone: "UTC",
        destination: null,
      }),
      getBookableSlotsForCalendar: async (
        _ctx: Row,
        resolved: Row,
        opts: Row,
      ) => {
        slotLookups.push({ calendarId: resolved.calendar.id, ...opts });
        return [
          {
            start: "2026-11-04T15:00:00.000Z",
            end: "2026-11-04T15:45:00.000Z",
            label: "Wed 16:00",
          },
          {
            start: "2026-11-04T16:00:00.000Z",
            end: "2026-11-04T16:45:00.000Z",
            label: "Wed 17:00",
          },
        ];
      },
    } as never,
    {
      recordAttendance: async (_ctx: Row, input: Row) => {
        attendance.push(input);
        return {
          result: "recorded",
          meeting: { ...w.meetings.get("meeting-1")!, leadEmail: "a@x.co" },
        };
      },
      createMeeting: async (_ctx: Row, dto: Row) => {
        created.push(dto);
        return { id: "new-meeting" };
      },
      getMeetingById: async () => ({}),
    } as never,
    {
      findContactByIdForOwner: async () => null,
      findOrCreateByPhone: async () => null,
    } as never,
    {
      notify: async (input: Row) => {
        supports.push(input);
        return { delivered: true, duplicate: false, recipientCount: 2 };
      },
    } as never,
    {
      scheduleFromVoiceAgent: async (input: Row) => {
        legacyCallbacks.push(input);
        return {
          id: input.agentCallId,
          scheduledAt: input.scheduledAt,
          status: "scheduled",
        };
      },
      scheduleAgentCallback: async (input: Row) => {
        const existing = [...w.callbacks.values()].find(
          (c) => c.agentCallbackKey === input.key,
        );
        if (existing) return existing;
        const row = {
          id: randomUUID(),
          ...input,
          agentCallbackKind: input.kind,
          agentCallbackKey: input.key,
          status: CallbackStatus.scheduled,
          createdAt: new Date(),
          notBefore: null,
          agentCallId: null,
          reason: null,
        };
        w.callbacks.set(row.id, row);
        agentCallbacks.push(row);
        return row;
      },
    } as never,
    {
      applyKnownOutcome: async (call: Row, outcome: string) => {
        outcomes.push({ call: call.id, outcome });
        return call;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      findByAgentCallId: async (agentCallId: string) =>
        agentCallId === "ac-1"
          ? {
              id: "exec-1",
              agentCallId: "ac-1",
              organizationId: "org-1",
              meetingId: "meeting-1",
              scheduleVersion: 3,
            }
          : null,
    } as never,
    w.handoffService,
  );

  return {
    service,
    slotLookups,
    created,
    supports,
    outcomes,
    agentCallbacks,
    legacyCallbacks,
    attendance,
  };
}

const CC = "v3:cc-1";

describe("VoiceAgentHandoffService — the destination", () => {
  it("is the workspace's own enabled, active scheduling agent", async () => {
    const w = world();
    const check = await w.handoffService.resolveDestination(
      { userId: "admin-1", organizationId: "org-1" },
      "es-ES",
    );
    assert.equal(check.ok, true);
    assert.equal(check.ok && check.agent.id, "agent-sched");
  });

  it("refuses a missing, paused, inactive, foreign or other-language destination", async () => {
    const ctx = { userId: "admin-1", organizationId: "org-1" };
    const cases: Array<[ReturnType<typeof world>, string]> = [
      [world({ automation: null }), "destination_missing"],
      [
        world({
          automation: {
            id: "auto-1",
            organizationId: "org-1",
            agentId: "agent-sched",
            enabled: false,
          },
        }),
        "destination_paused",
      ],
      [world({ scheduling: { status: "disabled" } }), "destination_inactive"],
      [
        world({ scheduling: { deletedAt: new Date() } }),
        "destination_inactive",
      ],
      [
        world({ scheduling: { providerAssistantId: null } }),
        "destination_inactive",
      ],
      // An automation row naming another workspace's agent resolves nothing.
      [
        world({
          automation: {
            id: "auto-1",
            organizationId: "org-1",
            agentId: "agent-foreign",
            enabled: true,
          },
        }),
        "destination_inactive",
      ],
      [world({ scheduling: { voiceLanguage: "en" } }), "language_mismatch"],
    ];
    for (const [w, reason] of cases) {
      const check = await w.handoffService.resolveDestination(ctx, "es");
      assert.deepEqual(check, { ok: false, reason });
    }
    config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-2"];
    try {
      const check = await world().handoffService.resolveDestination(ctx, "es");
      assert.deepEqual(check, { ok: false, reason: "automations_disabled" });
    } finally {
      config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-1", "org-2"];
    }
  });

  it("names the authorized destination as the reminders agent's only handoff target", async () => {
    const w = world();
    const targets = await w.handoffService.handoffTargetsFor(
      { userId: "admin-1", organizationId: "org-1" },
      w.agents.get("agent-rem") as never,
    );
    assert.deepEqual(
      targets.map((target) => target.assistantId),
      ["asst-sched"],
    );
    const none = await world({
      automation: null,
    }).handoffService.handoffTargetsFor(
      { userId: "admin-1", organizationId: "org-1" },
      w.agents.get("agent-rem") as never,
    );
    assert.deepEqual(none, []);
  });
});

describe("Reminders → scheduling handoff on the same call", () => {
  it("hands over with the request's context and language, and the source can change nothing after", async () => {
    const w = world();
    const t = tools(w);

    // The person cannot attend: the reminders agent records it, and is told
    // it may offer another time with the scheduling agent.
    const declined = await t.service.confirmMeetingAttendance(
      "agent-rem",
      REM_SECRET,
      CC,
      { attendance: "declined", note: "Hoy no puedo" },
    );
    assert.equal(declined.ok, true);
    assert.match(
      declined.ok ? declined.speech_instruction : "",
      /Carmen can do it on this call.*prepare_reschedule_handoff/,
    );

    const prepared = await t.service.prepareRescheduleHandoff(
      "agent-rem",
      REM_SECRET,
      CC,
      {
        person_said: "Hoy no puedo, tengo un viaje",
        preferences: "mañana por la tarde",
        identity_confirmed: true,
      },
    );
    assert.equal(prepared.ok, true);
    assert.equal(prepared.ok && prepared.handoff.to, "Carmen");

    // Persisted before the provider could hand anything over.
    const [handoff] = [...w.handoffs.values()];
    assert.equal(handoff!.status, H.prepared);
    assert.equal(handoff!.destinationAgentId, "agent-sched");
    assert.equal(handoff!.meetingId, "meeting-1");
    assert.equal(handoff!.meetingScheduleVersion, 3);
    assert.equal(handoff!.calendarId, "cal-meeting");
    assert.equal(handoff!.responsibleUserId, "member-1");
    assert.equal(handoff!.contactId, "contact-1");
    assert.equal(handoff!.language, "es");
    assert.equal(handoff!.languageSource, "source_agent_voice");
    assert.equal(handoff!.preferences, "mañana por la tarde");
    assert.deepEqual(handoff!.context, {
      identityConfirmed: true,
      attendanceRecorded: "declined",
    });

    // The scheduling agent's first tool call on the call proves the handoff.
    const context = await t.service.getHandoffContext(
      "agent-sched",
      SCHED_SECRET,
      CC,
    );
    assert.equal(context.ok, true);
    if (!context.ok) return;
    assert.equal(context.mode, "reschedule_existing_meeting");
    assert.equal(context.continuation, "same_call");
    assert.equal(context.language, "Spanish");
    assert.equal(context.person.first_name, "Ana");
    assert.equal(context.person.identity_confirmed, true);
    assert.equal(context.meeting.with, "Carlos Ruiz");
    assert.equal(context.meeting.time_zone, "Europe/Madrid");
    assert.equal(context.preferences, "mañana por la tarde");
    assert.match(context.speech_instruction, /Do not greet the person again/);
    assert.match(context.speech_instruction, /Speak Spanish/);
    assert.equal(w.handoffs.get(handoff!.id)!.status, H.completed);

    const [source, destination] = w.participants;
    assert.equal(source!.status, AiVoiceAgentParticipantStatus.handed_off);
    assert.equal(destination!.agentId, "agent-sched");
    assert.equal(destination!.role, AiVoiceAgentParticipantRole.handoff);
    assert.equal(destination!.status, AiVoiceAgentParticipantStatus.active);
    // Ending the source's part did not end the call.
    assert.equal(w.calls.get("call-1")!.endedAt, null);

    // Availability comes from the meeting's own calendar and length, and
    // the meeting does not block its own new time.
    const slots = await t.service.getAvailableSlots(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { date: "2026-11-04" },
    );
    assert.equal(slots.ok, true);
    assert.deepEqual(t.slotLookups, [
      {
        calendarId: "cal-meeting",
        date: "2026-11-04",
        durationMinutes: 45,
        excludeMeetingId: "meeting-1",
      },
    ]);
    assert.equal(w.offers.length, 1);
    assert.equal(w.handoffs.get(handoff!.id)!.offeredAgentCallId, "ac-1");

    // This delivery offers times; it never books a second meeting.
    const booked = await t.service.bookAppointment(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { start: "2026-11-04T15:00:00.000Z" },
    );
    assert.equal(booked.ok, false);
    assert.equal(t.created.length, 0);

    // The source holds nothing any more.
    for (const call of [
      () =>
        t.service.confirmMeetingAttendance("agent-rem", REM_SECRET, CC, {
          attendance: "confirmed",
        }),
      () =>
        t.service.scheduleCallback("agent-rem", REM_SECRET, CC, {
          scheduled_at: "2026-11-05T10:00:00+01:00",
        }),
      () =>
        t.service.requestHumanSupport("agent-rem", REM_SECRET, CC, {
          subject: "x",
          message: "y",
        }),
      () => t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {}),
      () =>
        t.service.scheduleRescheduleCallback("agent-rem", REM_SECRET, CC, {
          scheduled_at: "2026-11-05T10:00:00+01:00",
        }),
    ]) {
      const result = await call();
      assert.equal(result.ok, false);
      assert.match(
        (result as { error: string }).error,
        /handed to another assistant/,
      );
    }
    assert.equal(t.attendance.length, 1);
    assert.equal(t.legacyCallbacks.length, 0);
    assert.equal(t.agentCallbacks.length, 0);
    assert.equal(t.supports.length, 0);
  });

  it("is idempotent and order-independent across replayed and early tool calls", async () => {
    const w = world();
    const t = tools(w);
    const first = await t.service.prepareRescheduleHandoff(
      "agent-rem",
      REM_SECRET,
      CC,
      { preferences: "por la mañana" },
    );
    const replay = await t.service.prepareRescheduleHandoff(
      "agent-rem",
      REM_SECRET,
      CC,
      { preferences: "cualquier día" },
    );
    assert.equal(first.ok && replay.ok, true);
    assert.equal(w.handoffs.size, 1);
    // A replay does not rewrite the request.
    assert.equal([...w.handoffs.values()][0]!.preferences, "por la mañana");

    // The destination's first call may be availability, not the context.
    const slots = await t.service.getAvailableSlots(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { date: "2026-11-04" },
    );
    assert.equal(slots.ok, true);
    const again = await t.service.getHandoffContext(
      "agent-sched",
      SCHED_SECRET,
      CC,
    );
    assert.equal(again.ok, true);
    assert.equal(
      w.participants.filter((p) => p.agentId === "agent-sched").length,
      1,
    );
  });

  it("asks for help in its own name: a participant's request is not swallowed by the source's", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await t.service.getHandoffContext("agent-sched", SCHED_SECRET, CC);
    const support = await t.service.requestHumanSupport(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { subject: "Reschedule request", message: "Wednesday 16:00" },
    );
    assert.equal(support.ok, true);
    const destination = w.participants.find((p) => p.agentId === "agent-sched");
    assert.equal(t.supports[0]!.dedupeScope, destination!.id);
  });

  it("does not let an agent the workspace never authorized act on the call", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await assert.rejects(
      t.service.getAvailableSlots("agent-foreign", FOREIGN_SECRET, CC, {
        date: "2026-11-04",
      }),
      /Call does not belong to this agent/,
    );
    await assert.rejects(
      t.service.getHandoffContext("agent-foreign", FOREIGN_SECRET, CC),
      /Call does not belong to this agent/,
    );
    assert.equal(
      w.handoffs.get([...w.handoffs.keys()][0]!)!.status,
      H.prepared,
    );
  });

  it("never prepares a handoff the destination cannot take, but keeps the request visible", async () => {
    const w = world({ scheduling: { status: "disabled" } });
    const t = tools(w);
    const prepared = await t.service.prepareRescheduleHandoff(
      "agent-rem",
      REM_SECRET,
      CC,
      { preferences: "el jueves" },
    );
    assert.equal(prepared.ok, false);
    assert.equal((prepared as { fallback?: string }).fallback, "human_support");
    const [handoff] = [...w.handoffs.values()];
    assert.equal(handoff!.status, H.failed);
    assert.equal(handoff!.failureReason, "destination_inactive");
    assert.equal(handoff!.requestStatus, R.needs_attention);
    assert.equal(handoff!.destinationAgentId, null);
    // No participation was opened for anyone.
    assert.equal(w.participants.length, 0);
  });

  it("refuses a meeting that changed, or was cancelled, during the call", async () => {
    // Moved before the handoff: nothing is prepared on a stale time.
    const moved = world();
    moved.meetings.get("meeting-1")!.scheduleVersion = 4;
    const prepared = await tools(moved).service.prepareRescheduleHandoff(
      "agent-rem",
      REM_SECRET,
      CC,
      {},
    );
    assert.equal(prepared.ok, false);
    assert.match((prepared as { error: string }).error, /moved or cancelled/);
    assert.equal(moved.handoffs.size, 0);

    // Cancelled after the handoff: no times are offered on stale data.
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await t.service.getHandoffContext("agent-sched", SCHED_SECRET, CC);
    const meeting = w.meetings.get("meeting-1")!;
    meeting.status = MeetingStatus.cancelled;
    meeting.scheduleVersion = 4;
    const slots = await t.service.getAvailableSlots(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { date: "2026-11-04" },
    );
    assert.equal(slots.ok, false);
    assert.equal(t.slotLookups.length, 0);
  });

  it("keeps the person's requested language and refuses a destination that cannot speak it", async () => {
    const w = world();
    const t = tools(w);
    const prepared = await t.service.prepareRescheduleHandoff(
      "agent-rem",
      REM_SECRET,
      CC,
      { language: "English" },
    );
    // The scheduling agent was configured for Spanish only.
    assert.equal(prepared.ok, false);
    const [handoff] = [...w.handoffs.values()];
    assert.equal(handoff!.language, "en");
    assert.equal(handoff!.languageSource, "person_request");
    assert.equal(handoff!.failureReason, "language_mismatch");
  });
});

describe("When the handoff fails, or its outcome is unknown", () => {
  it("records a confirmed failure and a callback assigned to the scheduling agent", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {
      preferences: "jueves",
    });
    // The source still holds the call: the provider handoff did not happen.
    const callback = await t.service.scheduleRescheduleCallback(
      "agent-rem",
      REM_SECRET,
      CC,
      { scheduled_at: "2026-11-04T17:00:00+01:00", why: "handoff_failed" },
    );
    assert.equal(callback.ok, true);
    const replay = await t.service.scheduleRescheduleCallback(
      "agent-rem",
      REM_SECRET,
      CC,
      { scheduled_at: "2026-11-04T18:00:00+01:00", why: "handoff_failed" },
    );
    assert.equal(replay.ok, true);
    // One callback, for the scheduling agent, bound to the request.
    assert.equal(t.agentCallbacks.length, 1);
    const [row] = t.agentCallbacks;
    const [handoff] = [...w.handoffs.values()];
    assert.equal(row!.agentId, "agent-sched");
    assert.equal(row!.handoffId, handoff!.id);
    assert.equal(row!.kind, CallbackAgentKind.agreed);
    assert.equal(row!.contactId, "contact-1");
    assert.equal(handoff!.status, H.failed);
    assert.equal(handoff!.failureReason, "provider_handoff_failed");
    assert.equal(handoff!.requestStatus, R.pending);
    assert.deepEqual(t.outcomes.at(-1), {
      call: "ac-1",
      outcome: "callback_scheduled",
    });

    // A destination that arrives after the failure is refused.
    const late = await t.service.getHandoffContext(
      "agent-sched",
      SCHED_SECRET,
      CC,
    );
    assert.equal(late.ok, false);
    assert.equal(
      w.participants.filter((p) => p.agentId === "agent-sched").length,
      0,
    );
  });

  it("reconciles an uncertain handoff only after the call ended, then plans one recovery", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    const [handoff] = [...w.handoffs.values()];

    // Still live: no decision is taken while an assistant may be talking.
    let plans = await w.handoffService.reviewDue(
      new Date(handoff!.reviewAt.getTime()),
    );
    assert.deepEqual(plans, []);
    assert.equal(w.handoffs.get(handoff!.id)!.status, H.prepared);

    // The call ends with no proof either way.
    const endedAt = new Date(NOW.getTime() + 3 * 60_000);
    w.endCall("call-1", endedAt);
    const later = new Date(NOW.getTime() + 10 * 60_000);
    w.handoffs.get(handoff!.id)!.reviewAt = later;
    plans = await w.handoffService.reviewDue(later);
    const reconciled = w.handoffs.get(handoff!.id)!;
    assert.equal(reconciled.status, H.failed);
    assert.equal(reconciled.failureReason, "not_confirmed_before_call_ended");
    assert.equal(plans.length, 1);
    assert.equal(plans[0]!.agentId, "agent-sched");
    // At least an hour after the call, inside the calling window.
    assert.ok(
      plans[0]!.at.getTime() >= endedAt.getTime() + 60 * 60_000,
      plans[0]!.at.toISOString(),
    );
    assert.equal(plans[0]!.attempt, 1);
    // The participations of the finished call are over.
    assert.ok(
      w.participants.every(
        (p) => p.status !== AiVoiceAgentParticipantStatus.active,
      ),
    );

    // Planned once: a second tick racing the first plans nothing more.
    assert.equal(await w.handoffService.markRecoveryPlanned(plans[0]!), true);
    assert.equal(await w.handoffService.markRecoveryPlanned(plans[0]!), false);
  });

  it("does not recover a conversation the specialist already had", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await t.service.getHandoffContext("agent-sched", SCHED_SECRET, CC);
    await t.service.getAvailableSlots("agent-sched", SCHED_SECRET, CC, {
      date: "2026-11-04",
    });
    w.endCall();
    const [handoff] = [...w.handoffs.values()];
    const later = new Date(NOW.getTime() + 10 * 60_000);
    w.handoffs.get(handoff!.id)!.reviewAt = later;
    assert.deepEqual(await w.handoffService.reviewDue(later), []);
    const settled = w.handoffs.get(handoff!.id)!;
    assert.equal(settled.requestStatus, R.needs_attention);
    assert.equal(settled.resolution, "reschedule_commit_pending");
  });

  it("resolves the request when someone already moved the meeting, and withdraws its callbacks", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await t.service.scheduleRescheduleCallback("agent-rem", REM_SECRET, CC, {
      scheduled_at: "2026-11-04T17:00:00+01:00",
    });
    w.endCall();
    const meeting = w.meetings.get("meeting-1")!;
    meeting.scheduleVersion = 4;
    meeting.scheduledAt = new Date("2026-11-06T10:00:00.000Z");
    const [handoff] = [...w.handoffs.values()];
    const later = new Date(NOW.getTime() + 10 * 60_000);
    w.handoffs.get(handoff!.id)!.reviewAt = later;
    await w.handoffService.reviewDue(later);
    assert.equal(w.handoffs.get(handoff!.id)!.requestStatus, R.resolved);
    assert.equal(w.handoffs.get(handoff!.id)!.resolution, "meeting_moved");
    assert.equal(t.agentCallbacks[0]!.status, CallbackStatus.cancelled);
  });
});

describe("A callback for the request", () => {
  async function failedWithCallback(over: Parameters<typeof world>[0] = {}) {
    const w = world(over);
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {
      person_said: "Me surgió un viaje",
      preferences: "jueves por la tarde",
    });
    await t.service.scheduleRescheduleCallback("agent-rem", REM_SECRET, CC, {
      scheduled_at: "2026-11-04T17:00:00+01:00",
    });
    w.endCall();
    return { w, t, callback: t.agentCallbacks[0]! };
  }

  it("still calls after the original meeting time, with the context rebuilt", async () => {
    const { w, callback } = await failedWithCallback();
    // The meeting's time passed; the request to find another one did not.
    const at = new Date("2026-11-04T16:00:00.000Z");
    const decision = await w.handoffService.decideCallback(
      { ...callback, scheduledAt: at } as never,
      new Date(at.getTime() + 60_000),
    );
    assert.equal(decision.action, "dial");
    if (decision.action !== "dial") return;
    assert.equal(decision.agentId, "agent-sched");
    assert.equal(decision.to, "+34600111222");
    assert.equal(decision.responsibleUserId, "member-1");
    assert.equal(decision.binding.meetingId, "meeting-1");
    assert.equal(decision.binding.meetingScheduleVersion, 3);
    assert.equal(decision.variables.first_name, "Ana");
    assert.match(
      decision.variables.additional_context!,
      /that time has passed/,
    );
    assert.match(decision.variables.additional_context!, /jueves por la tarde/);
    assert.match(decision.variables.additional_context!, /get_handoff_context/);

    // The callback call's own participation binds its tools to the request.
    await w.handoffService.authorizeCallbackDial(
      { ...callback } as never,
      decision,
      { agentCallId: "ac-callback", callId: "call-callback" },
    );
    const participation = w.participants.find(
      (p) => p.agentCallId === "ac-callback",
    );
    assert.equal(participation!.role, AiVoiceAgentParticipantRole.callback);
    assert.equal(participation!.handoffId, callback.handoffId);
  });

  it("does not call while the source call may still be live", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await t.service.scheduleRescheduleCallback("agent-rem", REM_SECRET, CC, {
      scheduled_at: "2026-11-03T10:30:00+01:00",
      why: "person_prefers_callback",
    });
    const decision = await w.handoffService.decideCallback(
      t.agentCallbacks[0] as never,
      NOW,
    );
    assert.equal(decision.action, "defer");
    assert.equal(
      decision.action === "defer" && decision.reason,
      "source_call_live",
    );
  });

  it("withdraws itself when the meeting was already moved, and skips when the destination is gone", async () => {
    const { w, callback } = await failedWithCallback();
    w.meetings.get("meeting-1")!.scheduleVersion = 4;
    w.meetings.get("meeting-1")!.scheduledAt = new Date("2026-11-06T10:00:00Z");
    const resolved = await w.handoffService.decideCallback(
      callback as never,
      new Date("2026-11-04T16:01:00.000Z"),
    );
    assert.deepEqual(resolved, {
      action: "skip",
      status: CallbackStatus.cancelled,
      reason: "objective_resolved",
    });

    const gone = await failedWithCallback();
    gone.w.agents.get("agent-sched")!.status = "disabled";
    const skipped = await gone.w.handoffService.decideCallback(
      gone.callback as never,
      new Date("2026-11-04T16:01:00.000Z"),
    );
    assert.equal(skipped.action, "skip");
    assert.equal(
      skipped.action === "skip" && skipped.reason,
      "destination_destination_inactive",
    );
  });

  it("never rings an agreed callback hours late, and defers a recovery to the window", async () => {
    const { w, callback } = await failedWithCallback();
    const overdue = await w.handoffService.decideCallback(
      callback as never,
      new Date("2026-11-04T19:30:00.000Z"),
    );
    assert.deepEqual(overdue, {
      action: "skip",
      status: CallbackStatus.missed,
      reason: "overdue",
    });

    // 23:00 Madrid is outside the 09:00–20:00 window: the recovery waits.
    const night = new Date("2026-11-04T22:00:00.000Z");
    const deferred = await w.handoffService.decideCallback(
      {
        ...callback,
        agentCallbackKind: CallbackAgentKind.recovery,
        scheduledAt: night,
      } as never,
      night,
    );
    assert.equal(deferred.action, "defer");
    assert.equal(
      deferred.action === "defer" && deferred.until.toISOString(),
      "2026-11-05T08:00:00.000Z",
    );
  });

  it("refuses the dial at its commit point when the meeting changed after the decision", async () => {
    const { w, callback } = await failedWithCallback();
    const decision = await w.handoffService.decideCallback(
      callback as never,
      new Date("2026-11-04T16:01:00.000Z"),
    );
    assert.equal(decision.action, "dial");
    if (decision.action !== "dial") return;
    w.meetings.get("meeting-1")!.scheduleVersion = 5;
    await assert.rejects(
      w.handoffService.authorizeCallbackDial(callback as never, decision, {
        agentCallId: "ac-callback",
        callId: "call-callback",
      }),
      (error: Error & { reason?: string }) =>
        error.reason === "meeting_changed",
    );
    assert.equal(
      w.participants.some((p) => p.agentCallId === "ac-callback"),
      false,
    );
  });
});
