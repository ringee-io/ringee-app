/// <reference types="node" />

import "reflect-metadata";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { NotFoundException } from "@nestjs/common";
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
import { isInWorkspace } from "@ringee/platform";
import { VoiceAgentToolService } from "../voice-agent-tool.service";
import { MeetingReminderCallService } from "./meeting-reminder-call.service";
import { assertVoiceAgentAutomations } from "./automation-access";
import { VoiceAgentHandoffService } from "./voice-agent-handoff.service";

const config = apiConfiguration as unknown as Record<string, unknown>;
config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-1", "org-2"];

const H = AiVoiceAgentHandoffStatus;
const R = AiVoiceAgentHandoffRequestStatus;

const REM_SECRET = "rva_reminders";
const SCHED_SECRET = "rva_scheduling";
const FOREIGN_SECRET = "rva_foreign";
const STRANGER_SECRET = "rva_stranger";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** 2026-11-03 10:00 Madrid: inside the default calling window. */
const NOW = new Date("2026-11-03T09:00:00.000Z");
const MEETING_AT = new Date("2026-11-03T15:00:00.000Z");

// Every fixture is dated around NOW, and the tools read the clock: a test
// must not start failing on the day its fixtures fall in the past.
beforeEach(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
afterEach(() => mock.timers.reset());

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
    /** What enrolling the follow-up objective does, after the pilot gate. */
    enroll?: () => Promise<unknown>;
    /** The request's follow-up objective, when it has one. */
    objective?: Row;
    /** Whether the request's owner is still a member of the organization. */
    ownerIsMember?: boolean;
    /**
     * The workspace every fixture row belongs to: the organization by default,
     * or a freelancer's personal workspace (Stage 4A).
     */
    workspace?: { userId: string; organizationId: string | null };
  } = {},
) {
  const scope = over.workspace ?? {
    userId: "admin-1",
    organizationId: "org-1",
  };
  const agents = new Map<string, Row>();
  agents.set("agent-rem", {
    id: "agent-rem",
    name: "Sofía",
    type: "reminders_notifications",
    status: "active",
    ...scope,
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
    ...scope,
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
  // Another freelancer's scheduling agent: a null organization like every
  // personal row, and never the same workspace as anyone else's.
  agents.set("agent-stranger", {
    id: "agent-stranger",
    name: "Stranger",
    type: "appointment_booking",
    status: "active",
    userId: "stranger-1",
    organizationId: null,
    voiceLanguage: "es",
    providerAssistantId: "asst-stranger",
    toolSecretHash: hash(STRANGER_SECRET),
    deletedAt: null,
    meetingDurationMinutes: 30,
    calendarId: null,
    calendarIntegrationId: null,
  });

  const automation =
    over.automation === undefined
      ? {
          id: "auto-1",
          ...scope,
          capability: "appointment_booking",
          agentId: "agent-sched",
          enabled: true,
        }
      : over.automation;

  const contact = {
    id: "contact-1",
    ...scope,
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
    ...scope,
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
    ...scope,
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
    ...scope,
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

  // The reminder executions that placed calls. One store for every service
  // that reads them, so a link written late is seen by all of them.
  const executions = new Map<string, Row>();
  executions.set("exec-1", {
    id: "exec-1",
    agentCallId: "ac-1",
    ...scope,
    meetingId: "meeting-1",
    scheduleVersion: 3,
    status: "placed",
  });
  const executionRepo = {
    findByAgentCallId: async (agentCallId: string) =>
      clone(
        [...executions.values()].find(
          (row) => row.agentCallId === agentCallId,
        ) ?? null,
      ),
  };

  const handoffRepo = {
    recordExceptionalIntervention: async () => undefined,
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

  // The repositories' ownership filter (WRK-001): an organization by its id,
  // a personal workspace by its owner and a null organization.
  const sameOrg = (ctx: Row, row: Row | undefined | null) =>
    row && isInWorkspace(ctx as never, row) ? row : null;

  const handoffService = new VoiceAgentHandoffService(
    handoffRepo as never,
    {
      findForOwner: async (ctx: Row) =>
        automation && isInWorkspace(ctx as never, automation)
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
    executionRepo as never,
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
        id === contact.id && isInWorkspace(ctx as never, contact)
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
    {
      // The real step is pilot-gated: it refuses an organization off the
      // allowlist.
      prepareFollowUpObjective: async (ctx: Row) => {
        assertVoiceAgentAutomations(ctx as never);
        return over.enroll ? over.enroll() : undefined;
      },
      followUpForHandoff: async () => over.objective ?? null,
    } as never,
    {
      isMember: async () => over.ownerIsMember ?? true,
      isWorkspaceMember: async () => over.ownerIsMember ?? true,
    } as never,
  );

  return {
    agents,
    meetings,
    calls,
    agentCalls,
    executions,
    executionRepo,
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
  const decisions: Row[] = [];
  const moves: Row[] = [];
  const repeats: Row[] = [];
  /**
   * What `MeetingService.moveForAgent` answers — a successful move by
   * default — and what `completeRepeatedMove` finds: no earlier move.
   */
  const move: { outcome: Row | null; repeat: Row | null } = {
    outcome: null,
    repeat: null,
  };

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
      recordAgentDecision: async (_ctx: Row, input: Row) => {
        decisions.push(input);
        return {
          id: "action-1",
          kind: input.cancel ? "cancelled" : "declined_without_rescheduling",
        };
      },
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
      moveForAgent: async (_ctx: Row, input: Row) => {
        moves.push(input);
        if (move.outcome) return move.outcome;
        const meeting = w.meetings.get(input.meetingId)!;
        return {
          result: "moved",
          meeting: {
            ...meeting,
            scheduledAt: input.scheduledAt,
            scheduleVersion: input.expectedScheduleVersion + 1,
          },
          previousScheduledAt: meeting.scheduledAt,
          repeated: false,
        };
      },
      completeRepeatedMove: async (_ctx: Row, input: Row) => {
        repeats.push(input);
        return move.repeat;
      },
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
      scheduleFromVoiceAgent: async (ctx: Row, input: Row) => {
        legacyCallbacks.push({ ...ctx, ...input });
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
      rescheduleAgreedAgentCallback: async (id: string, scheduledAt: Date) => {
        const row = w.callbacks.get(id)!;
        row.scheduledAt = scheduledAt;
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
    w.executionRepo as never,
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
    decisions,
    moves,
    repeats,
    move,
  };
}

const CC = "v3:cc-1";

/**
 * The reminder worker (AGENT-019) over the same world: its executions are the
 * world's, with the repository's compare-and-set transitions, and its dial
 * places the reminder call the tools above are driven on (`ac-1` on `call-1`,
 * reached by `CC`). `failPlacementWrites` makes that many `markPlaced` writes
 * fail the way a dropped database connection does.
 */
function reminderWorker(
  w: ReturnType<typeof world>,
  opts: { failPlacementWrites?: number } = {},
) {
  let clock = NOW;
  let failingWrites = opts.failPlacementWrites ?? 0;
  const startCalls: Row[] = [];
  const providerDials: Row[] = [];
  const policy = {
    id: "policy-1",
    enabled: true,
    version: 1,
    agentId: "agent-rem",
    windowStartMinute: 9 * 60,
    windowEndMinute: 20 * 60,
    windowDays: [0, 1, 2, 3, 4, 5, 6],
  };
  const copy = (row: Row | undefined) => (row ? { ...row } : null);
  const holds = (row: Row | undefined, token: unknown, now: Date) =>
    row?.status === "claimed" &&
    row.claimToken === token &&
    row.leaseExpiresAt.getTime() > now.getTime();

  const executionRepo = {
    claimDue: async (now: Date, leaseUntil: Date, limit: number) =>
      [...w.executions.values()]
        .filter(
          (row) =>
            (row.status === "scheduled" &&
              row.fireAt.getTime() <= now.getTime()) ||
            (row.status === "claimed" &&
              row.leaseExpiresAt.getTime() < now.getTime()),
        )
        .slice(0, limit)
        .map((row) => {
          Object.assign(row, {
            status: "claimed",
            claimToken: randomUUID(),
            leaseExpiresAt: leaseUntil,
            updatedAt: now,
          });
          return { ...row };
        }),
    beginDial: async (
      id: string,
      claimToken: string,
      now: Date,
      leaseUntil: Date,
    ) => {
      const row = w.executions.get(id);
      if (!holds(row, claimToken, now)) return null;
      if (row!.dialReservedAt === null) {
        Object.assign(row!, {
          dialTries: row!.dialTries + 1,
          dialReservedAt: now,
          leaseExpiresAt: leaseUntil,
        });
      }
      return { ...row! };
    },
    authorizeDial: async (
      execution: Row,
      now: Date,
      earliestMeetingAt: Date,
      leaseUntil: Date,
    ) => {
      const row = w.executions.get(execution.id);
      const meeting = w.meetings.get(execution.meetingId);
      if (
        !holds(row, execution.claimToken, now) ||
        !meeting ||
        meeting.scheduleVersion !== execution.scheduleVersion ||
        ![MeetingStatus.scheduled, MeetingStatus.rescheduled].includes(
          meeting.status,
        ) ||
        meeting.attendanceStatus !== "pending" ||
        meeting.scheduledAt.getTime() < earliestMeetingAt.getTime()
      ) {
        return false;
      }
      row!.leaseExpiresAt = leaseUntil;
      return true;
    },
    markPlaced: async (id: string, agentCallId: string, claimToken: string) => {
      if (failingWrites > 0) {
        failingWrites--;
        throw new Error("Connection terminated unexpectedly");
      }
      const row = w.executions.get(id);
      if (row?.status !== "claimed" || row.claimToken !== claimToken) {
        return false;
      }
      Object.assign(row, {
        status: "placed",
        agentCallId,
        leaseExpiresAt: null,
        claimToken: null,
        updatedAt: clock,
      });
      return true;
    },
    finish: async (
      id: string,
      status: string,
      from: string[],
      data?: Row,
      claimToken?: string,
    ) => {
      const row = w.executions.get(id);
      if (
        !row ||
        !from.includes(row.status) ||
        (from.includes("claimed") && row.claimToken !== claimToken)
      ) {
        return false;
      }
      Object.assign(row, {
        status,
        finishedAt: clock,
        leaseExpiresAt: null,
        ...(data?.reason ? { reason: data.reason } : {}),
        ...(data?.lastError ? { lastError: data.lastError } : {}),
      });
      return true;
    },
    defer: async (
      id: string,
      fireAt: Date,
      reason: string,
      claimToken: string,
      unplaced = false,
    ) => {
      const row = w.executions.get(id);
      if (row?.status !== "claimed" || row.claimToken !== claimToken) {
        return false;
      }
      Object.assign(row, {
        status: "scheduled",
        fireAt,
        leaseExpiresAt: null,
        claimToken: null,
        reason,
        ...(unplaced ? { dialReservedAt: null } : {}),
      });
      return true;
    },
    finishByAgentCall: async (
      agentCallId: string,
      status: string,
      from: string[],
    ) => {
      const row = [...w.executions.values()].find(
        (e) => e.agentCallId === agentCallId,
      );
      if (!row || !from.includes(row.status)) return false;
      Object.assign(row, { status, finishedAt: clock, leaseExpiresAt: null });
      return true;
    },
    listUnansweredForRetry: async () => [],
    listPlacedBefore: async (before: Date) =>
      [...w.executions.values()]
        .filter(
          (row) =>
            row.status === "placed" &&
            row.updatedAt.getTime() < before.getTime(),
        )
        .map((row) => ({ ...row })),
    hasActiveForMeeting: async (
      meetingId: string,
      excludeId: string | null,
      activeSince: Date,
    ) =>
      [...w.executions.values()].some(
        (row) =>
          row.meetingId === meetingId &&
          row.id !== excludeId &&
          ["claimed", "placed"].includes(row.status) &&
          row.updatedAt.getTime() >= activeSince.getTime(),
      ),
    findById: async (id: string) => copy(w.executions.get(id)),
  };

  const service = new MeetingReminderCallService(
    executionRepo as never,
    {
      findById: async (id: string) => (id === policy.id ? { ...policy } : null),
      findForCalendar: async () => ({ ...policy }),
    } as never,
    { findById: async (id: string) => copy(w.meetings.get(id)) } as never,
    {
      findByIdForOwner: async (_ctx: Row, id: string) =>
        id === "cal-meeting" ? { id, timezone: "Europe/Madrid" } : null,
      findDefault: async () => ({ id: "cal-global", timezone: "UTC" }),
    } as never,
    {
      findByIdForOwner: async (ctx: Row, id: string) => {
        const agent = w.agents.get(id);
        return agent?.organizationId === ctx.organizationId
          ? { ...agent }
          : null;
      },
    } as never,
    {
      findByIdempotencyKey: async (key: string) =>
        copy(
          [...w.agentCalls.values()].find(
            (call) => call.idempotencyKey === key,
          ),
        ),
      hasLiveCallToNumber: async () => false,
      findById: async (id: string) => copy(w.agentCalls.get(id)),
    } as never,
    { findForOwner: async () => null } as never,
    {
      findById: async () => ({ firstName: "Carlos", lastName: "Ruiz" }),
    } as never,
    {
      // VoiceAgentCallService.startCall's contract: the agent call is written
      // under the dial key before the commit point, then the leg is placed.
      startCall: async (
        ctx: Row,
        agentId: string,
        input: Row,
        beforePlacement?: (call: {
          agentCallId: string;
          callId: string;
        }) => Promise<void>,
      ) => {
        startCalls.push({ ctx, agentId, ...input });
        const agentCall: Row = {
          id: "ac-1",
          agentId,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          callId: "call-1",
          contactId: "contact-1",
          toNumber: input.to,
          providerCallControlId: null,
          status: "created",
          idempotencyKey: input.idempotencyKey,
          variables: input.variables,
        };
        w.agentCalls.set(agentCall.id, agentCall);
        await beforePlacement?.({
          agentCallId: agentCall.id,
          callId: agentCall.callId,
        });
        providerDials.push({ to: input.to, key: input.idempotencyKey });
        Object.assign(agentCall, {
          providerCallControlId: CC,
          status: "initiating",
        });
        return { id: agentCall.id, status: agentCall.status };
      },
    } as never,
    { previousInteractions: async () => "" } as never,
    { hasActiveWithNumber: async () => false } as never,
  );
  (service as unknown as { now: () => Date }).now = () => clock;

  return {
    service,
    startCalls,
    providerDials,
    /** One worker tick at `at`. */
    tick(at: Date) {
      clock = at;
      return service.processDue(at);
    },
  };
}

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
    // Told who it is and who spoke before: the provider gives it the earlier
    // turns as if they were its own.
    assert.equal(context.you_are, "Carmen");
    assert.equal(context.handed_over_by, "Sofía");
    assert.match(
      context.speech_instruction,
      /^You are Carmen, and you are continuing this call: Sofía spoke with the person before you/,
    );
    assert.match(
      context.speech_instruction,
      /never repeat it or speak as Sofía/,
    );
    assert.match(context.speech_instruction, /introduce yourself as Carmen/);
    assert.match(
      context.speech_instruction,
      /Do not greet them as if you had just called/,
    );
    assert.match(
      context.speech_instruction,
      /do not check again who you are speaking with/,
    );
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

  it("retries recording a request for help, and tells the person it was requested whatever the write does", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await t.service.getHandoffContext("agent-sched", SCHED_SECRET, CC);
    let failures = 1;
    const recorded: boolean[] = [];
    w.handoffService.recordExceptionalIntervention = async (
      _grant,
      delivered,
    ) => {
      recorded.push(delivered);
      if (failures-- > 0) throw new Error("database unavailable");
    };
    const ask = () =>
      t.service.requestHumanSupport("agent-sched", SCHED_SECRET, CC, {
        subject: "Reschedule request",
        message: "Wednesday 16:00",
      });
    // A transient failure is retried within the same tool call.
    assert.equal((await ask()).ok, true);
    assert.deepEqual(recorded, [true, true]);
    // A repeated request (a duplicate delivery) still records it.
    assert.equal((await ask()).ok, true);
    assert.equal(recorded.length, 3);
    // A write that keeps failing is tried a bounded number of times.
    failures = Infinity;
    recorded.length = 0;
    assert.equal((await ask()).ok, true);
    assert.equal(recorded.length, 3);
  });

  it("re-validates the destination when it first acts, and refuses a participant once the call ended", async () => {
    // Deactivated after the request was prepared: the provider may still
    // hand the call over, but that authorizes nothing.
    const paused = world();
    const p = tools(paused);
    await p.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    paused.agents.get("agent-sched")!.status = "disabled";
    const refused = await p.service.getHandoffContext(
      "agent-sched",
      SCHED_SECRET,
      CC,
    );
    assert.equal(refused.ok, false);
    assert.match(
      (refused as { error: string }).error,
      /not available on this call/,
    );
    assert.equal([...paused.handoffs.values()][0]!.status, H.prepared);
    assert.equal(
      paused.participants.some((x) => x.agentId === "agent-sched"),
      false,
    );

    // A late or replayed tool call of the agent that took the call, after
    // the call ended, changes nothing.
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await t.service.getHandoffContext("agent-sched", SCHED_SECRET, CC);
    w.endCall();
    const slots = await t.service.getAvailableSlots(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { date: "2026-11-04" },
    );
    assert.equal(slots.ok, false);
    assert.match((slots as { error: string }).error, /no longer active/);
    const callback = await t.service.scheduleCallback(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { scheduled_at: "2026-11-05T10:00:00+01:00" },
    );
    assert.equal(callback.ok, false);
    assert.equal(t.slotLookups.length, 0);
    assert.equal(w.offers.length, 0);
    assert.equal(t.agentCallbacks.length, 0);
  });

  it("refuses a callback participant's tools after its call ends", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    const handoff = [...w.handoffs.values()][0]!;
    const agentCall = {
      ...w.agentCalls.get("ac-1")!,
      id: "ac-callback",
      agentId: "agent-sched",
    };
    w.participants.push({
      id: "callback-participant",
      agentCallId: agentCall.id,
      agentId: agentCall.agentId,
      handoffId: handoff.id,
      role: AiVoiceAgentParticipantRole.callback,
      status: AiVoiceAgentParticipantStatus.active,
    });
    const grant = () =>
      w.handoffService.grantFor(
        w.agents.get("agent-sched") as never,
        agentCall as never,
      );
    assert.equal((await grant()).kind, "participant");
    w.endCall();
    assert.deepEqual(await grant(), { kind: "refused", reason: "call_ended" });
  });

  it("withdraws a callback when its request or meeting changes during creation", async () => {
    for (const change of [R.resolved, R.closed, R.needs_attention, "moved"]) {
      const w = world();
      const t = tools(w);
      await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
      await t.service.getHandoffContext("agent-sched", SCHED_SECRET, CC);
      const handoff = [...w.handoffs.values()][0]!;
      const callbacks = (t.service as unknown as { callbacks: Row }).callbacks;
      const schedule = callbacks.scheduleAgentCallback;
      callbacks.scheduleAgentCallback = async (input: Row) => {
        const callback = await schedule(input);
        if (change === "moved") {
          const meeting = w.meetings.get("meeting-1")!;
          meeting.scheduleVersion += 1;
          meeting.scheduledAt = new Date("2026-11-06T10:00:00.000Z");
        } else {
          handoff.requestStatus = change;
        }
        return callback;
      };

      const result = await t.service.scheduleCallback(
        "agent-sched",
        SCHED_SECRET,
        CC,
        { scheduled_at: "2026-11-05T10:00:00+01:00" },
      );
      assert.equal(result.ok, false);
      assert.match(
        (result as { error: string }).error,
        /nothing left to call back about/,
      );
      assert.equal(t.agentCallbacks.length, 1);
      assert.equal(t.agentCallbacks[0]!.status, CallbackStatus.cancelled);
      assert.equal(t.outcomes.length, 0);
    }
  });

  it("lets the agent that took the call agree a callback only while the request still wants one", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await t.service.getHandoffContext("agent-sched", SCHED_SECRET, CC);
    const [handoff] = [...w.handoffs.values()];

    const agreed = await t.service.scheduleCallback(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { scheduled_at: "2026-11-05T10:00:00+01:00" },
    );
    assert.equal(agreed.ok, true);
    assert.equal(t.agentCallbacks.length, 1);
    assert.equal(t.agentCallbacks[0]!.agentId, "agent-sched");
    assert.equal(t.agentCallbacks[0]!.handoffId, handoff!.id);
    assert.equal(t.agentCallbacks[0]!.kind, CallbackAgentKind.agreed);

    // Settled meanwhile: nothing is promised that would be withdrawn when due.
    w.handoffs.get(handoff!.id)!.requestStatus = R.needs_attention;
    const settled = await t.service.scheduleCallback(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { scheduled_at: "2026-11-06T10:00:00+01:00" },
    );
    assert.equal(settled.ok, false);
    assert.match(
      (settled as { error: string }).error,
      /nothing left to call back about/,
    );

    // Moved by someone during the call: the same.
    const moved = world();
    const m = tools(moved);
    await m.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await m.service.getHandoffContext("agent-sched", SCHED_SECRET, CC);
    const meeting = moved.meetings.get("meeting-1")!;
    meeting.scheduleVersion = 4;
    meeting.scheduledAt = new Date("2026-11-06T10:00:00.000Z");
    const late = await m.service.scheduleCallback(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { scheduled_at: "2026-11-05T10:00:00+01:00" },
    );
    assert.equal(late.ok, false);
    assert.equal(m.agentCallbacks.length, 0);
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

  it("records the request without an objective when enrollment is refused, and only then", async () => {
    // A responsible member who left, a contact deleted since: refused.
    const refused = world({
      enroll: async () => {
        throw new NotFoundException("Follow-up source not found");
      },
    });
    const prepared = await tools(refused).service.prepareRescheduleHandoff(
      "agent-rem",
      REM_SECRET,
      CC,
      {},
    );
    assert.equal(prepared.ok, true);
    const [handoff] = [...refused.handoffs.values()];
    assert.equal(handoff!.status, H.prepared);
    assert.equal(handoff!.requestStatus, R.pending);
    // Any other failure is not swallowed.
    const broken = world({
      enroll: async () => {
        throw new Error("database unavailable");
      },
    });
    await assert.rejects(
      tools(broken).service.prepareRescheduleHandoff(
        "agent-rem",
        REM_SECRET,
        CC,
        {},
      ),
      /database unavailable/,
    );
    assert.equal(broken.handoffs.size, 0);
  });

  it("still records the refused request for review when the pilot is off", async () => {
    const w = world();
    const t = tools(w);
    config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-2"];
    try {
      const prepared = await t.service.prepareRescheduleHandoff(
        "agent-rem",
        REM_SECRET,
        CC,
        { preferences: "el jueves" },
      );
      assert.equal(prepared.ok, false);
      assert.equal(
        (prepared as { fallback?: string }).fallback,
        "human_support",
      );
    } finally {
      config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-1", "org-2"];
    }
    const [handoff] = [...w.handoffs.values()];
    assert.equal(handoff!.status, H.failed);
    assert.equal(handoff!.failureReason, "automations_disabled");
    assert.equal(handoff!.requestStatus, R.needs_attention);
    assert.equal(
      handoff!.resolution,
      "destination_unavailable:automations_disabled",
    );
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

describe("Explicit appointment cancellation", () => {
  it("keeps cancellation behind the workspace pilot", async () => {
    const t = tools(world());
    config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-2"];
    try {
      assert.equal(
        (
          await t.service.finishMeetingResponse("agent-rem", REM_SECRET, CC, {
            cancellation: "yes",
            rescheduling: "declined",
            response: "Yes, cancel.",
          })
        ).ok,
        false,
      );
      assert.equal(t.decisions.length, 0);
    } finally {
      config.AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS = ["org-1", "org-2"];
    }
  });

  it("retains the reservation for no or unclear, and cancels only on yes", async () => {
    for (const cancellation of ["no", "unclear", "yes"]) {
      const t = tools(world());
      const result = await t.service.finishMeetingResponse(
        "agent-rem",
        REM_SECRET,
        CC,
        {
          cancellation,
          rescheduling: "declined",
          response:
            cancellation === "yes"
              ? "Yes, please cancel it."
              : "Keep it for now.",
        },
      );
      assert.equal(result.ok, true);
      assert.equal(t.decisions.length, 1);
      assert.equal(t.decisions[0].cancel, cancellation === "yes");
      assert.equal(t.decisions[0].meetingId, "meeting-1");
      assert.equal(t.decisions[0].expectedScheduleVersion, 3);
    }
  });
  it("refuses a malformed answer and a source that already handed over", async () => {
    const t = tools(world());
    assert.equal(
      (
        await t.service.finishMeetingResponse("agent-rem", REM_SECRET, CC, {
          cancellation: "yes",
          rescheduling: "declined",
          response: 42 as never,
        })
      ).ok,
      false,
    );
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    await t.service.getHandoffContext("agent-sched", SCHED_SECRET, CC);
    assert.equal(
      (
        await t.service.finishMeetingResponse("agent-rem", REM_SECRET, CC, {
          cancellation: "yes",
          rescheduling: "declined",
          response: "Yes, cancel.",
        })
      ).ok,
      false,
    );
    assert.equal(t.decisions.length, 0);
  });
});

describe("Moving the handed meeting on the call (AGENT-021)", () => {
  /** A future time on the hour, so the "already past" guard never trips. */
  const later = () =>
    new Date(Math.ceil((Date.now() + 2 * 86_400_000) / 3_600_000) * 3_600_000);

  async function handedOver(w: ReturnType<typeof world>) {
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {
      person_said: "Hoy no puedo",
      preferences: "mañana",
    });
    // The scheduling agent's first tool call completes the handoff.
    const context = await t.service.getHandoffContext(
      "agent-sched",
      SCHED_SECRET,
      CC,
    );
    assert.equal(context.ok, true);
    return t;
  }

  it("moves the meeting it was handed, at the version it was handed, and closes the request", async () => {
    const w = world();
    const t = await handedOver(w);
    const start = later();

    const result = await t.service.moveMeeting(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { time_confirmed: true, start: start.toISOString() },
    );
    assert.equal(result.ok, true);
    assert.equal(t.moves.length, 1);
    const [input] = t.moves;
    // Everything but the time comes from the request, never the model.
    assert.equal(input!.meetingId, "meeting-1");
    assert.equal(input!.expectedScheduleVersion, 3);
    assert.equal(input!.scheduledAt.getTime(), start.getTime());
    assert.equal(input!.durationMinutes, 45);
    assert.equal(input!.agentCallId, "ac-1");
    assert.equal(input!.resolvedCalendar.calendar.id, "cal-meeting");
    // Moved, not booked: no second meeting beside it.
    assert.deepEqual(t.created, []);

    if (!result.ok) return;
    assert.equal(result.meeting.start, start.toISOString());
    assert.equal(result.email, "will_be_sent");
    assert.match(result.speech_instruction, /email with the new time/);
    assert.match(
      result.speech_instruction,
      /do not say it has already been sent/,
    );

    const [handoff] = [...w.handoffs.values()];
    assert.equal(handoff!.requestStatus, R.resolved);
    assert.equal(handoff!.resolution, "meeting_moved_by_agent");
  });

  it("promises no email to a person with no address on file", async () => {
    const w = world();
    const t = await handedOver(w);
    const meeting = w.meetings.get("meeting-1")!;
    t.move.outcome = {
      result: "moved",
      meeting: { ...meeting, leadEmail: null, contact: { email: null } },
      previousScheduledAt: meeting.scheduledAt,
      repeated: false,
    };
    const result = await t.service.moveMeeting(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { time_confirmed: true, start: later().toISOString() },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.email, "no_email_on_file");
    assert.match(result.speech_instruction, /do not promise them an email/);
  });

  it("moves nothing for an agent nothing was handed to, or that handed the call away", async () => {
    const w = world();
    const t = tools(w);
    const root = await t.service.moveMeeting("agent-rem", REM_SECRET, CC, {
      time_confirmed: true,
      start: later().toISOString(),
    });
    assert.equal(root.ok, false);
    assert.match(root.ok ? "" : root.error, /no meeting to move on this call/);

    const handed = await handedOver(w);
    const source = await handed.service.moveMeeting(
      "agent-rem",
      REM_SECRET,
      CC,
      { time_confirmed: true, start: later().toISOString() },
    );
    assert.equal(source.ok, false);
    assert.match(source.ok ? "" : source.error, /handed to another assistant/);
    assert.deepEqual([...t.moves, ...handed.moves], []);
  });

  it("offers other times when the one chosen was just taken, and keeps the request open", async () => {
    const w = world();
    const t = await handedOver(w);
    t.move.outcome = { result: "unavailable" };
    const result = await t.service.moveMeeting(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { time_confirmed: true, start: later().toISOString() },
    );
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /get_available_slots again/);
    assert.equal([...w.handoffs.values()][0]!.requestStatus, R.pending);
  });

  it("does not move a meeting that changed during the call", async () => {
    const w = world();
    const t = await handedOver(w);
    t.move.outcome = { result: "stale" };
    const result = await t.service.moveMeeting(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { time_confirmed: true, start: later().toISOString() },
    );
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /was not moved/);
    assert.equal([...w.handoffs.values()][0]!.requestStatus, R.pending);
  });

  it("refuses a time in the past before asking anything", async () => {
    const w = world();
    const t = await handedOver(w);
    const result = await t.service.moveMeeting(
      "agent-sched",
      SCHED_SECRET,
      CC,
      {
        time_confirmed: true,
        start: new Date(Date.now() - 60_000).toISOString(),
      },
    );
    assert.equal(result.ok, false);
    assert.deepEqual(t.moves, []);
  });

  it("finishes a move a retry finds already made, without moving it again", async () => {
    const w = world();
    const t = await handedOver(w);
    const start = later();
    const meeting = w.meetings.get("meeting-1")!;
    // The first attempt committed; the version gate would now refuse it.
    t.move.repeat = {
      result: "moved",
      meeting: { ...meeting, scheduledAt: start, scheduleVersion: 4 },
      previousScheduledAt: null,
      repeated: true,
    };
    const result = await t.service.moveMeeting(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { time_confirmed: true, start: start.toISOString() },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(t.repeats, [
      {
        handoffId: [...w.handoffs.values()][0]!.id,
        meetingId: "meeting-1",
        expectedScheduleVersion: 3,
        scheduledAt: start,
      },
    ]);
    assert.deepEqual(t.moves, []);
    assert.equal([...w.handoffs.values()][0]!.requestStatus, R.resolved);
  });

  it("moves nothing on a request the team is already handling", async () => {
    const w = world();
    const t = await handedOver(w);
    [...w.handoffs.values()][0]!.requestStatus = R.needs_attention;
    const result = await t.service.moveMeeting(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { time_confirmed: true, start: later().toISOString() },
    );
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /already settled/);
    assert.match(
      result.ok ? "" : result.error,
      /only after it succeeds say the time is noted/,
    );
    assert.deepEqual(t.moves, []);
  });

  it("promises nothing when the chosen time is the one the meeting has", async () => {
    const w = world();
    const t = await handedOver(w);
    t.move.outcome = { result: "unchanged" };
    const result = await t.service.moveMeeting(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { time_confirmed: true, start: later().toISOString() },
    );
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /no email was sent/);
    assert.equal([...w.handoffs.values()][0]!.requestStatus, R.pending);
  });

  it("refuses a start that is not a time with an offset, without asking anything", async () => {
    const w = world();
    const t = await handedOver(w);
    for (const start of [1_800_000_000 as never, "", "2026-11-05T10:00:00"]) {
      const result = await t.service.moveMeeting(
        "agent-sched",
        SCHED_SECRET,
        CC,
        { time_confirmed: true, start },
      );
      assert.equal(result.ok, false);
      assert.match(result.ok ? "" : result.error, /timezone offset/);
    }
    assert.deepEqual([...t.moves, ...t.repeats], []);
  });

  it("sends book_appointment on a handed call to move_meeting instead", async () => {
    const w = world();
    const t = await handedOver(w);
    const booked = await t.service.bookAppointment(
      "agent-sched",
      SCHED_SECRET,
      CC,
      { start: later().toISOString() },
    );
    assert.equal(booked.ok, false);
    assert.match(booked.ok ? "" : booked.error, /call move_meeting/);
    assert.deepEqual(t.created, []);
  });
});

describe("A reminder call whose placement could not be recorded", () => {
  it("is recovered by its dial key, never dialed again, and its tools still find the meeting", async () => {
    const w = world({
      meeting: { attendanceStatus: "pending", attendanceAgentCallId: null },
    });
    // Nothing is dialed yet: the worker places the reminder call itself.
    w.agentCalls.delete("ac-1");
    w.executions.clear();
    const key = "meeting:meeting-1:v3:policy:policy-1:p1:T-240m:a1";
    w.executions.set("exec-r", {
      id: "exec-r",
      userId: "admin-1",
      organizationId: "org-1",
      meetingId: "meeting-1",
      agentId: "agent-rem",
      trigger: "policy",
      policyId: "policy-1",
      policyVersion: 1,
      scheduleVersion: 3,
      offsetMinutes: 240,
      attempt: 1,
      idempotencyKey: key,
      fireAt: NOW,
      status: "scheduled",
      dialTries: 0,
      dialReservedAt: null,
      claimToken: null,
      leaseExpiresAt: null,
      agentCallId: null,
      reason: null,
      lastError: null,
      updatedAt: NOW,
    });
    const worker = reminderWorker(w, { failPlacementWrites: 1 });

    // The call is placed, then the write that links it to the execution fails.
    await worker.tick(NOW);
    assert.equal(worker.providerDials.length, 1);
    assert.equal(worker.providerDials[0]!.key, `${key}:d1`);
    let execution = w.executions.get("exec-r")!;
    // Neither rejected nor unplaced: still claimed with its try reserved, and
    // the agent call carries the dial key that leads back to it.
    assert.equal(execution.status, "claimed");
    assert.equal(execution.reason, null);
    assert.equal(execution.finishedAt, undefined);
    assert.equal(execution.dialTries, 1);
    assert.equal(execution.agentCallId, null);
    assert.equal(w.agentCalls.get("ac-1")!.idempotencyKey, `${key}:d1`);

    // While the lease holds, no tick takes it over.
    await worker.tick(new Date(NOW.getTime() + 60_000));
    assert.equal(worker.startCalls.length, 1);
    assert.equal(w.executions.get("exec-r")!.status, "claimed");

    // Once it runs out, the next tick restores the link by the dial key.
    await worker.tick(new Date(NOW.getTime() + 6 * 60_000));
    execution = w.executions.get("exec-r")!;
    assert.equal(execution.status, "placed");
    assert.equal(execution.agentCallId, "ac-1");
    assert.equal(execution.claimToken, null);

    // One start and one provider call, then and after.
    await worker.tick(new Date(NOW.getTime() + 12 * 60_000));
    assert.equal(worker.startCalls.length, 1);
    assert.equal(worker.providerDials.length, 1);

    // The call's tools resolve the meeting it was placed about.
    const t = tools(w);
    const answered = await t.service.confirmMeetingAttendance(
      "agent-rem",
      REM_SECRET,
      CC,
      { attendance: "declined", note: "Hoy no puedo" },
    );
    assert.equal(answered.ok, true);
    assert.equal(t.attendance.length, 1);
    assert.equal(t.attendance[0]!.meetingId, "meeting-1");
    assert.equal(t.attendance[0]!.expectedScheduleVersion, 3);
    assert.equal(t.attendance[0]!.executionId, "exec-r");
    assert.equal(t.attendance[0]!.agentCallId, "ac-1");

    const prepared = await t.service.prepareRescheduleHandoff(
      "agent-rem",
      REM_SECRET,
      CC,
      { person_said: "Hoy no puedo", identity_confirmed: true },
    );
    assert.equal(prepared.ok, true);
    const [handoff] = [...w.handoffs.values()];
    assert.equal(handoff!.status, H.prepared);
    assert.equal(handoff!.agentCallId, "ac-1");
    assert.equal(handoff!.meetingId, "meeting-1");
    assert.equal(handoff!.meetingScheduleVersion, 3);
    assert.equal(handoff!.reminderExecutionId, "exec-r");
  });
});

describe("When the handoff fails, or its outcome is unknown", () => {
  it("does not read or change a handoff or schedule a callback after hangup", async () => {
    for (const status of [null, H.prepared, H.uncertain, H.failed]) {
      const w = world();
      const t = tools(w);
      if (status) {
        await t.service.prepareRescheduleHandoff(
          "agent-rem",
          REM_SECRET,
          CC,
          {},
        );
        [...w.handoffs.values()][0]!.status = status;
      }
      w.endCall();
      const before = [...w.handoffs.values()].map((row) => ({ ...row }));
      const repo = (w.handoffService as unknown as { handoffs: Row }).handoffs;
      let reads = 0;
      const read = repo.findByIdempotencyKey;
      repo.findByIdempotencyKey = async (key: string) => {
        reads += 1;
        return read(key);
      };
      assert.deepEqual(
        await w.handoffService.failToCallback(
          { userId: "admin-1", organizationId: "org-1" },
          w.agents.get("agent-rem") as never,
          w.agentCalls.get("ac-1") as never,
          { why: "handoff_failed" },
        ),
        { ok: false, code: "call_ended" },
      );

      const result = await t.service.scheduleRescheduleCallback(
        "agent-rem",
        REM_SECRET,
        CC,
        { scheduled_at: "2026-11-04T17:00:00+01:00", why: "handoff_failed" },
      );
      assert.equal(result.ok, false);
      assert.equal(reads, 0);
      assert.deepEqual([...w.handoffs.values()], before);
      assert.equal(t.agentCallbacks.length, 0);
    }
  });

  it("refuses same-time replays of callbacks that are no longer scheduled", async () => {
    for (const status of Object.values(CallbackStatus).filter(
      (status) => status !== CallbackStatus.scheduled,
    )) {
      const w = world();
      const t = tools(w);
      const input = {
        scheduled_at: "2026-11-04T17:00:00+01:00",
        why: "handoff_failed" as const,
      };
      assert.equal(
        (
          await t.service.scheduleRescheduleCallback(
            "agent-rem",
            REM_SECRET,
            CC,
            input,
          )
        ).ok,
        true,
      );
      const callback = t.agentCallbacks[0]!;
      callback.status = status;
      const result = await t.service.scheduleRescheduleCallback(
        "agent-rem",
        REM_SECRET,
        CC,
        input,
      );
      assert.equal(result.ok, false);
      assert.match(
        (result as { error: string }).error,
        /can no longer be changed/,
      );
      assert.equal(callback.status, status);
      assert.equal(t.agentCallbacks.length, 1);
      assert.equal(t.outcomes.length, 1);
    }
  });

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
    // The person changed the time on the same call: the one callback moves
    // to it, and the time confirmed back is the one stored.
    assert.equal(
      replay.ok && replay.callback.scheduled_at,
      "2026-11-04T17:00:00.000Z",
    );
    // One callback, for the scheduling agent, bound to the request.
    assert.equal(t.agentCallbacks.length, 1);
    assert.equal(
      t.agentCallbacks[0]!.scheduledAt.toISOString(),
      "2026-11-04T17:00:00.000Z",
    );
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

    // A callback no longer waiting is never revived by another time.
    row!.status = CallbackStatus.cancelled;
    const revived = await t.service.scheduleRescheduleCallback(
      "agent-rem",
      REM_SECRET,
      CC,
      { scheduled_at: "2026-11-04T19:00:00+01:00", why: "handoff_failed" },
    );
    assert.equal(revived.ok, false);
    assert.equal(row!.status, CallbackStatus.cancelled);
    assert.equal(row!.scheduledAt.toISOString(), "2026-11-04T17:00:00.000Z");
  });

  it("promises no callback when the destination took the call in the meantime", async () => {
    const w = world();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    const [handoff] = [...w.handoffs.values()];
    // The destination's first tool call lands between the source's read of
    // the request and its write.
    const repo = (w.handoffService as unknown as { handoffs: Row }).handoffs;
    const failLive = repo.failLive;
    repo.failLive = async (...args: unknown[]) => {
      w.handoffs.get(handoff!.id)!.status = H.completed;
      return failLive(...args);
    };
    const callback = await t.service.scheduleRescheduleCallback(
      "agent-rem",
      REM_SECRET,
      CC,
      { scheduled_at: "2026-11-04T17:00:00+01:00", why: "handoff_failed" },
    );
    assert.equal(callback.ok, false);
    assert.equal(t.agentCallbacks.length, 0);
    assert.equal(w.handoffs.get(handoff!.id)!.status, H.completed);
  });

  it("does not recover a person who chose to be called back, but recovers a failed handoff", async () => {
    for (const why of ["person_prefers_callback", "handoff_failed"] as const) {
      const w = world();
      const t = tools(w);
      await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
      // The source took the callback path, but no callback was created.
      const failed = await w.handoffService.failToCallback(
        { userId: "admin-1", organizationId: "org-1" },
        w.agents.get("agent-rem") as never,
        w.agentCalls.get("ac-1") as never,
        { why },
      );
      assert.equal(failed.ok, true);
      w.endCall();
      const [handoff] = [...w.handoffs.values()];
      const later = new Date(NOW.getTime() + 10 * 60_000);
      w.handoffs.get(handoff!.id)!.reviewAt = later;
      const plans = await w.handoffService.reviewDue(later);
      const settled = w.handoffs.get(handoff!.id)!;
      if (why === "person_prefers_callback") {
        // Never a call at a time they did not agree to: a person decides.
        assert.deepEqual(plans, []);
        assert.equal(settled.requestStatus, R.needs_attention);
        assert.equal(settled.resolution, "person_prefers_callback");
      } else {
        assert.equal(plans.length, 1);
        assert.equal(settled.requestStatus, R.pending);
      }
    }
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

  it("places nothing on behalf of an owner who left the organization", async () => {
    const { w, callback } = await failedWithCallback({ ownerIsMember: false });
    const at = new Date("2026-11-04T16:00:00.000Z");
    const decision = await w.handoffService.decideCallback(
      { ...callback, scheduledAt: at } as never,
      new Date(at.getTime() + 60_000),
    );
    assert.deepEqual(decision, {
      action: "skip",
      status: CallbackStatus.missed,
      reason: "owner_not_member",
    });
  });

  it("promises no callback due after the request's objective expires", async () => {
    const expiresAt = new Date(NOW.getTime() + 2 * 86_400_000);
    const w = world({
      objective: {
        id: "objective-1",
        mode: "automatic",
        state: "in_progress",
        revision: 1,
        expiresAt,
      },
    });
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    // At the expiry itself is too late: the objective is over by then.
    for (const at of [expiresAt, new Date(expiresAt.getTime() + 86_400_000)]) {
      const late = await t.service.scheduleRescheduleCallback(
        "agent-rem",
        REM_SECRET,
        CC,
        { scheduled_at: at.toISOString() },
      );
      assert.equal(late.ok, false);
      assert.match(
        (late as { error: string }).error,
        /could not be scheduled.*Do not promise/,
      );
    }
    assert.equal(t.agentCallbacks.length, 0);
    const inTime = await t.service.scheduleRescheduleCallback(
      "agent-rem",
      REM_SECRET,
      CC,
      { scheduled_at: "2026-11-04T17:00:00+01:00" },
    );
    assert.equal(inTime.ok, true);
    assert.equal(t.agentCallbacks.length, 1);
  });

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

// ── Stage 4A: a freelancer's personal workspace ─────────────────────────────

describe("Personal workspace handoffs (Stage 4A)", () => {
  const OWNER = { userId: "owner-1", organizationId: null };
  const personalWorld = () =>
    world({ workspace: OWNER, meeting: { responsibleUserId: "owner-1" } });
  let previous: unknown;
  beforeEach(() => {
    previous = config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS;
    config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS = ["owner-1"];
  });
  afterEach(() => {
    config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS = previous;
  });

  it("hands an enrolled freelancer's call to their own scheduling agent", async () => {
    const w = personalWorld();
    const t = tools(w);
    const destination = await w.handoffService.resolveDestination(OWNER, "es");
    assert.equal(destination.ok && destination.agent.id, "agent-sched");

    const prepared = await t.service.prepareRescheduleHandoff(
      "agent-rem",
      REM_SECRET,
      CC,
      { person_said: "Hoy no puedo", identity_confirmed: true },
    );
    assert.equal(prepared.ok, true);
    const [handoff] = [...w.handoffs.values()];
    assert.equal(handoff!.userId, "owner-1");
    assert.equal(handoff!.organizationId, null);
    assert.equal(handoff!.destinationAgentId, "agent-sched");
    assert.equal(handoff!.responsibleUserId, "owner-1");

    const context = await t.service.getHandoffContext(
      "agent-sched",
      SCHED_SECRET,
      CC,
    );
    assert.equal(context.ok, true);
    assert.equal(w.handoffs.get(handoff!.id)!.status, H.completed);
    // The source handed it over and may change nothing from then on.
    const grant = await w.handoffService.grantFor(
      w.agents.get("agent-rem") as never,
      w.agentCalls.get("ac-1") as never,
    );
    assert.deepEqual(grant, { kind: "refused", reason: "handed_off" });
  });

  it("never lets another freelancer's agent take or act on the call", async () => {
    const w = personalWorld();
    const t = tools(w);
    await t.service.prepareRescheduleHandoff("agent-rem", REM_SECRET, CC, {});
    // Both workspaces have a null organization; neither is the other.
    assert.deepEqual(
      await w.handoffService.grantFor(
        w.agents.get("agent-stranger") as never,
        w.agentCalls.get("ac-1") as never,
      ),
      { kind: "refused", reason: "not_participant" },
    );
    await assert.rejects(
      t.service.getHandoffContext("agent-stranger", STRANGER_SECRET, CC),
      /Call does not belong to this agent/,
    );
    await assert.rejects(
      t.service.getAvailableSlots("agent-stranger", STRANGER_SECRET, CC, {
        date: "2026-11-04",
      }),
      /Call does not belong to this agent/,
    );
    assert.equal([...w.handoffs.values()][0]!.status, H.prepared);
    // The stranger's own workspace is not admitted, and owns nothing here.
    assert.deepEqual(
      await w.handoffService.resolveDestination(
        { userId: "stranger-1", organizationId: null },
        "es",
      ),
      { ok: false, reason: "automations_disabled" },
    );
  });

  it("keeps the request visible, without a live handoff, when the owner is off the pilot", async () => {
    config.AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS = [];
    const w = personalWorld();
    const t = tools(w);
    const prepared = await t.service.prepareRescheduleHandoff(
      "agent-rem",
      REM_SECRET,
      CC,
      {},
    );
    assert.equal(prepared.ok, false);
    const [handoff] = [...w.handoffs.values()];
    assert.equal(handoff!.organizationId, null);
    assert.equal(handoff!.requestStatus, R.needs_attention);
    assert.equal(
      handoff!.resolution,
      "destination_unavailable:automations_disabled",
    );
  });
});
