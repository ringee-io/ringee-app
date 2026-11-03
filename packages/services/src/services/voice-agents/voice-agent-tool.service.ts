import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import {
  CallRepository,
  CallbackAgentKind,
  AiVoiceAgentHandoffRequestStatus,
  type MeetingMoveOutcome,
  CallbackStatus,
  InboundDestinationType,
  AiVoiceAgent,
  AiVoiceAgentCall,
  AiVoiceAgentCallRepository,
  AiVoiceAgentOutcome,
  AiVoiceAgentRepository,
  MeetingReminderExecutionRepository,
} from "@ringee/database";
import {
  RedisService,
  VoiceAgentProviderService,
  hashApiKey,
  safeHashEqual,
  type OrganizationOwnershipContext,
  type OwnershipContext,
} from "@ringee/platform";
import { CalendarService, ResolvedCalendar } from "../calendar.service";
import { ContactService } from "../contact.service";
import { MeetingService, normalizeEmail } from "../meeting.service";
import { CallbackService } from "../outbound/callback.service";
import {
  AI_VOICE_AGENT_CONTACT_SOURCE,
  contactIdentityFromVariables,
} from "./voice-agent.types";
import { VoiceAgentHumanSupportService } from "./voice-agent-human-support.service";
import { VoiceAgentResultService } from "./voice-agent-result.service";
import {
  VoiceAgentHandoffService,
  type HandoffContextView,
  type HandoffGrant,
  type PrepareRescheduleFailure,
} from "./automations/voice-agent-handoff.service";

import { InboundRouteResolverService } from "../inbound-routing/inbound-route-resolver.service";
import { InboundCallRouterService } from "../inbound-routing/inbound-call-router.service";
import { InboundRingService } from "../inbound-routing/inbound-ring.service";
import type { RouteExecutionResult } from "../inbound-routing/inbound-routing.types";

/**
 * Headers the provider sends: the shared secret it holds for this agent, and
 * the call it is on, filled from a system variable rather than by the model.
 */
export const VOICE_AGENT_TOOL_SECRET_HEADER = "x-ringee-tool-secret";
export const VOICE_AGENT_CALL_ID_HEADER = "x-ringee-call-control-id";

/** How many times to offer at once (§9: offer few slots at a time). */
const MAX_OFFERED_SLOTS = 3;
const SUPPORT_SUBJECT_MAX = 120;
const SUPPORT_MESSAGE_MAX = 2000;
const CALLBACK_NOTE_MAX = 2000;
const ATTENDANCE_NOTE_MAX = 1000;
/**
 * Waits between tries to record a participant's request for help. Until it
 * is recorded the request stays pending, and a scheduled callback could still
 * dial: a transient failure is retried within the tool call, a few times.
 */
const INTERVENTION_RETRY_DELAYS_MS = [150, 500];

/**
 * A participant moving a handed-over meeting gives it the person's new time
 * with `move_meeting` — never a second meeting beside the first.
 */
const RESCHEDULE_COMMIT_UNAVAILABLE =
  "A new meeting must not be booked beside the one you are moving. To give it the time the person agreed, call move_meeting with that time instead.";

const RESCHEDULE_SLOT_SPEECH_INSTRUCTION =
  "These are times the meeting can move to, on its own calendar. Offer them in one natural sentence in the conversation's language, at most three. When the person chooses one, repeat it back, get an explicit yes, and call move_meeting with that slot's start. Say the meeting is moved only after it returns success.";

/** Result shapes the model reads back. Failures are data, not exceptions. */
export type ToolResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export interface AvailableSlotsResult {
  timezone: string;
  duration_minutes: number;
  /** Just-in-time guidance the model reads before it speaks the returned data. */
  speech_instruction: string;
  slots: Array<{ start: string; label: string }>;
}

const NATURAL_SLOT_SPEECH_INSTRUCTION =
  "Offer these times in one natural sentence in the conversation's language. Say each clock time fully in words and join alternatives with a spoken conjunction. Do not read the raw list, punctuation, labels, colons, numbered items, AM/PM abbreviations or ISO timestamps aloud.";

export interface BookAppointmentResult {
  appointment: { id: string; start: string; end: string; link?: string };
}

export interface ScheduleCallbackResult {
  callback: { id: string; scheduled_at: string; status: string };
  speech_instruction: string;
}

export interface AttendanceResult {
  attendance: "confirmed" | "declined";
  /** Whether the shared confirmation email has an address to go to. */
  email: "will_be_sent" | "no_email_on_file" | "not_applicable";
  speech_instruction: string;
}

export interface HumanSupportResult {
  request: {
    subject: string;
    notified_recipients: number;
    contact_attached: boolean;
    already_requested: boolean;
  };
  speech_instruction: string;
}

export interface RescheduleHandoffResult {
  handoff: {
    status: "ready";
    /** The assistant the handoff tool passes the call to. */
    to: string;
  };
  speech_instruction: string;
}

export type HandoffContextResult = HandoffContextView;

export interface MoveMeetingResult {
  meeting: { start: string; end: string; time_zone: string };
  /** Whether the lead is on the email the move sends. */
  email: "will_be_sent" | "no_email_on_file";
  speech_instruction: string;
}

/**
 * When the meeting could not be moved, the team finishes the change — and
 * the person hears so only once the team was actually told.
 */
const MOVE_FALLS_TO_TEAM =
  "Call request_human_support with the chosen time, and only after it succeeds say the time is noted and that the team will confirm it.";

/**
 * The server side of the agent's tools.
 *
 * These are called by the voice provider mid-conversation, so they are the one
 * place where a request arrives with no Ringee session behind it. Two things
 * follow: the shared secret is the proof of authorization, and the workspace is
 * derived from the stored agent — never from anything in the request.
 *
 * Failures the agent can talk its way out of (no slots, a time that just got
 * taken) come back as data so it can offer something else. Only a request that
 * has no business being here is refused outright.
 */
@Injectable()
export class VoiceAgentToolService {
  private readonly logger = new Logger(VoiceAgentToolService.name);

  constructor(
    private readonly agents: AiVoiceAgentRepository,
    private readonly agentCalls: AiVoiceAgentCallRepository,
    private readonly calendars: CalendarService,
    private readonly meetings: MeetingService,
    private readonly contacts: ContactService,
    private readonly humanSupport: VoiceAgentHumanSupportService,
    private readonly callbacks: CallbackService,
    private readonly results: VoiceAgentResultService,
    private readonly calls: CallRepository,
    private readonly directory: InboundRouteResolverService,
    private readonly router: InboundCallRouterService,
    private readonly ring: InboundRingService,
    private readonly provider: VoiceAgentProviderService,
    private readonly redis: RedisService,
    private readonly reminderExecutions: MeetingReminderExecutionRepository,
    private readonly handoffs: VoiceAgentHandoffService,
  ) {}

  private async authorizeReceptionist(
    agentId: string,
    secret: string,
    controlId: string | null,
  ) {
    const { agent, ctx } = await this.authorize(agentId, secret);
    const agentCall = controlId
      ? await this.agentCalls.findByCallControlId(controlId)
      : null;
    const call = agentCall?.callId
      ? await this.calls.findById(agentCall.callId)
      : null;
    if (
      !ctx.organizationId ||
      !agentCall ||
      agentCall.agentId !== agent.id ||
      !call ||
      call.organizationId !== ctx.organizationId ||
      call.direction !== "inbound" ||
      call.callControlId !== controlId ||
      call.inboundDestinationType !== "ai_receptionist" ||
      call.inboundDestinationId !== agent.id ||
      call.endedAt
    )
      throw new UnauthorizedException(
        "No active inbound conversation for this agent.",
      );
    return { ctx, call };
  }

  async searchDirectory(
    agentId: string,
    secret: string,
    controlId: string | null,
    input: { query?: string },
  ) {
    const { ctx, call } = await this.authorizeReceptionist(
      agentId,
      secret,
      controlId,
    );
    if (call.inboundTransferState)
      return { ok: false, error: "A transfer is already in progress." };
    const result = await this.directory.searchDirectory(ctx, input.query ?? "");
    const destinations = result.destinations.filter(
      (entry) => entry.destinationType !== "desk_phone",
    );
    // A valid id alone is insufficient: it must have come from this call's directory lookup.
    await Promise.all(
      destinations.map((entry) =>
        this.redis.hashSet(
          `receptionist-directory:${call.id}`,
          `${entry.destinationType}:${entry.destinationId}`,
          true,
          3600,
        ),
      ),
    );
    return { ok: true, destinations, has_more: result.hasMore };
  }

  async transferToDestination(
    agentId: string,
    secret: string,
    controlId: string | null,
    input: { destination_type?: string; destination_id?: string },
  ) {
    const { ctx, call } = await this.authorizeReceptionist(
      agentId,
      secret,
      controlId,
    );
    const type = input.destination_type;
    const id = input.destination_id;
    if (
      !type ||
      !["user", "ring_group", "extension"].includes(type) ||
      !id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      return {
        ok: false,
        error: "Select a destination returned by search_directory.",
      };
    // A completed command remains successful even if availability or the directory
    // changes afterwards. The stored destination is the authorization for its replay.
    if (call.inboundTransferState) {
      if (
        call.inboundTransferDestinationType !== type ||
        call.inboundTransferDestinationId !== id
      )
        return { ok: false, error: "Another transfer is already in progress." };
      if (call.inboundTransferState === "connected")
        return { ok: true, transferred: true };
      if (call.inboundTransferState === "failed")
        return { ok: false, error: "The transfer could not be completed." };
    }
    const seen = await this.redis.hashGetAll<boolean>(
      `receptionist-directory:${call.id}`,
    );
    if (!seen[`${type}:${id}`])
      return {
        ok: false,
        error: "Look up this destination in the directory first.",
      };
    const destination = await this.directory.resolveDestination(ctx, {
      destinationType: type as InboundDestinationType,
      destinationId: id,
    });
    if ("reason" in destination)
      return {
        ok: false,
        error:
          "I cannot find that destination. Ask the caller what they would like to do instead.",
      };
    const userIds =
      destination.type === "ring_group"
        ? destination.memberUserIds
        : destination.type === "user" || destination.type === "extension"
          ? [destination.userId]
          : [];
    if (!(await this.ring.controlledTargets(ctx, userIds)).length)
      return {
        ok: false,
        error:
          "Nobody is available at that destination. Ask the caller what they would like to do instead.",
      };
    const locked = await this.calls.beginInboundTransfer(ctx, call.id, {
      type: type as InboundDestinationType,
      id,
    });
    if (
      !locked ||
      locked.endedAt ||
      locked.inboundTransferDestinationId !== id ||
      locked.inboundTransferDestinationType !== type
    )
      return { ok: false, error: "Another transfer is already in progress." };
    if (locked.inboundTransferState === "connected")
      return { ok: true, transferred: true };
    if (locked.inboundTransferState === "failed")
      return { ok: false, error: "The transfer could not be completed." };
    const { call: current, transitioned } =
      await this.calls.markTransferRinging(call.callControlId!);
    if (!current || current.endedAt)
      return { ok: false, error: "The caller disconnected." };
    if (current.inboundTransferState === "connected")
      return { ok: true, transferred: true };
    if (current.inboundTransferState !== "ringing")
      return { ok: false, error: "The transfer is no longer available." };
    // Only the request that started the ringing rings anyone. A concurrent or
    // repeated call would otherwise race it, and its failure path would cancel
    // the legs the first one is ringing.
    if (!transitioned) return { ok: true, transferred: false, ringing: true };
    let result: RouteExecutionResult;
    try {
      result = await this.router.routeInboundCall({
        call: current,
        ctx,
        destination,
        callerName: null,
        origin: {
          transport: "call_control",
          toNumber: call.toNumber,
          fromNumber: call.fromNumber,
          callerId: call.fromNumber,
        },
      });
    } catch (error) {
      result = {
        status: "failed",
        reason: "provider_refused",
        detail: (error as Error).message,
      };
    }
    if (result.status === "failed") {
      // Nothing rings, so the caller is still talking to the assistant. Hand
      // the conversation back rather than hanging up on them; a leg whose
      // dial outcome was lost is cancelled and hung up when it reports in.
      this.logger.warn(
        `Transfer of call ${call.id} could not ring ${type} ${id}: ${result.detail}`,
      );
      await this.ring.cancelRinging(current, { reason: "transfer_failed" });
      await this.calls.resetInboundTransfer(call.id);
      return {
        ok: false,
        error:
          "Nobody at that destination could be reached. Ask the caller what they would like to do instead.",
      };
    }
    // Only now does the assistant stop, so it cannot talk over the person who
    // picks up. The caller leg, its recording and the logical call stay as
    // they are; the answer handler repeats this stop if it wins the race.
    await this.provider.stopInboundAssistant(
      call.callControlId!,
      `receptionist-stop-${call.id}`,
    );
    return { ok: true, transferred: false, ringing: true };
  }

  async getAvailableSlots(
    agentId: string,
    secret: string,
    callControlId: string | null,
    input: { date?: string },
  ): Promise<ToolResult<AvailableSlotsResult>> {
    const { agent, ctx } = await this.authorize(agentId, secret);
    const date = this.requireDate(input.date);

    const agentCall = callControlId
      ? await this.agentCalls.findByCallControlId(callControlId)
      : null;
    if (agentCall) {
      // Another agent's call is reachable only through a handoff it was
      // given; its availability is the handed meeting's, not this agent's.
      const grant = await this.handoffs.grantFor(agent, agentCall);
      if (grant.kind === "participant") {
        return this.rescheduleSlots(ctx, grant, date);
      }
      if (grant.kind === "refused") return this.refuse(grant);
    }

    let resolved: ResolvedCalendar;
    try {
      resolved = await this.resolveCalendarForCall(ctx, agent, agentCall);
    } catch (error) {
      return { ok: false, error: this.calendarErrorMessage(agentId, error) };
    }

    // The calendar's zone wins over the agent's own `timezone` field: the
    // windows are wall-clock times on that calendar, so reading them in another
    // zone would offer times the calendar never opened.
    const timezone = resolved.timezone;

    try {
      const slots = await this.calendars.getBookableSlotsForCalendar(
        ctx,
        resolved,
        {
          date,
          durationMinutes: agent.meetingDurationMinutes,
        },
      );

      return {
        ok: true,
        timezone,
        duration_minutes: agent.meetingDurationMinutes,
        speech_instruction: NATURAL_SLOT_SPEECH_INSTRUCTION,
        slots: slots
          .slice(0, MAX_OFFERED_SLOTS)
          .map(({ start, label }) => ({ start, label })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Availability lookup failed for agent ${agentId}: ${message}`,
      );
      // The agent is told the lookup failed, not that the day is free — it must
      // never offer a time it could not verify.
      return {
        ok: false,
        error:
          "The calendar could not be reached, so no times can be offered right now.",
      };
    }
  }

  /**
   * Which calendar this call reads and books against.
   *
   * Resolved from the stored agent and its workspace, never from a tool
   * argument — the model cannot reach another calendar by naming one. The
   * result is pinned to the call the first time it is needed, so editing the
   * agent while the conversation is running cannot move the booking to a
   * different calendar than the one whose times were already offered.
   */
  private async resolveCalendarForCall(
    ctx: OwnershipContext,
    agent: AiVoiceAgent,
    agentCall: AiVoiceAgentCall | null,
  ): Promise<ResolvedCalendar> {
    if (agentCall?.calendarId) {
      return this.calendars.resolveCalendar(ctx, {
        calendarId: agentCall.calendarId,
        fallbackIntegrationId: agent.calendarIntegrationId,
        // A calendar archived mid-call still finishes the conversation it was
        // already offering times from.
        allowArchived: true,
      });
    }

    const resolved = await this.calendars.resolveCalendar(ctx, {
      calendarId: agent.calendarId,
      fallbackIntegrationId: agent.calendarIntegrationId,
    });
    if (agentCall) {
      const pinned = await this.agentCalls.pinCalendarIfUnset(
        agentCall.id,
        resolved.calendar.id,
      );
      if (!pinned) {
        // Another tool call on this conversation pinned first. Follow that one,
        // not this lookup, so both tools agree for the rest of the call.
        const current = await this.agentCalls.findById(agentCall.id);
        if (
          current?.calendarId &&
          current.calendarId !== resolved.calendar.id
        ) {
          return this.calendars.resolveCalendar(ctx, {
            calendarId: current.calendarId,
            fallbackIntegrationId: agent.calendarIntegrationId,
            allowArchived: true,
          });
        }
      }
    }
    return resolved;
  }

  /**
   * A calendar that is archived or gone is reported as such rather than
   * silently swapped for the global one — an agent pointed at a specific
   * calendar must never book somewhere else.
   */
  private calendarErrorMessage(agentId: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `Calendar resolution failed for agent ${agentId}: ${message}`,
    );
    return "This agent's calendar is not available, so no times can be offered or booked.";
  }

  async bookAppointment(
    agentId: string,
    secret: string,
    callControlId: string | null,
    input: { start?: string; attendee_email?: string; notes?: string },
  ): Promise<ToolResult<BookAppointmentResult>> {
    const { agent, ctx } = await this.authorize(agentId, secret);

    const start = this.parseStart(input.start);
    if (!start) {
      return {
        ok: false,
        error: "The start time was not a valid date and time.",
      };
    }
    if (start.getTime() <= Date.now()) {
      return { ok: false, error: "That time is already in the past." };
    }

    const agentCall = callControlId
      ? await this.agentCalls.findByCallControlId(callControlId)
      : null;
    if (agentCall) {
      // The call named by the header belongs to a different agent: refuse
      // rather than book against someone else's conversation — unless it was
      // handed over, and then a second meeting beside the one being moved is
      // exactly what must not happen.
      const grant = await this.handoffs.grantFor(agent, agentCall);
      if (grant.kind === "participant") {
        return { ok: false, error: RESCHEDULE_COMMIT_UNAVAILABLE };
      }
      if (grant.kind === "refused") return this.refuse(grant);
    }

    // One appointment per conversation. The agent can call this tool twice —
    // it re-asks after a garbled reply, and the provider retries a timed-out
    // tool call — and without this each attempt creates a second meeting on
    // the user's calendar. The link recorded on the call is the marker, so a
    // repeat returns the booking that already exists.
    if (agentCall?.meetingId) {
      const booked = await this.meetings.getMeetingById(
        ctx,
        agentCall.meetingId,
      );
      if (
        agentCall.outcome !== AiVoiceAgentOutcome.meeting_booked &&
        agentCall.outcome !== AiVoiceAgentOutcome.appointment_booked
      ) {
        await this.repairAppointmentOutcome(agentCall.id);
      }
      const bookedStart = new Date(booked.scheduledAt);
      return {
        ok: true,
        appointment: {
          id: booked.id,
          start: bookedStart.toISOString(),
          end: new Date(
            bookedStart.getTime() + booked.duration * 60_000,
          ).toISOString(),
          ...(booked.location ? { link: booked.location } : {}),
        },
      };
    }

    const contactId = await this.resolveContactId(ctx, agentCall);
    if (!contactId) {
      return {
        ok: false,
        error: "There is no contact to book this meeting for.",
      };
    }

    let resolved: ResolvedCalendar;
    try {
      // The same calendar the times were offered from — resolved on the server
      // from the stored agent, and pinned to this call.
      resolved = await this.resolveCalendarForCall(ctx, agent, agentCall);
    } catch (error) {
      return { ok: false, error: this.calendarErrorMessage(agentId, error) };
    }

    try {
      const timezone = resolved.timezone;
      const date = this.dateInTimeZone(start, timezone);
      const slots = await this.calendars.getBookableSlotsForCalendar(
        ctx,
        resolved,
        {
          date,
          durationMinutes: agent.meetingDurationMinutes,
        },
      );
      const exactSlot = slots.find(
        (slot) => new Date(slot.start).getTime() === start.getTime(),
      );
      if (!exactSlot) {
        return {
          ok: false,
          error:
            "That time is no longer available. Offer another available time.",
        };
      }

      const meeting = await this.meetings.createMeeting(ctx, {
        contactId,
        callId: agentCall?.callId ?? undefined,
        title: agent.meetingTitle || "Meeting",
        scheduledAt: start.toISOString(),
        duration: agent.meetingDurationMinutes,
        notes: input.notes,
        attendeeEmail: input.attendee_email,
        calendarIntegrationId: agent.calendarIntegrationId,
        resolvedCalendar: resolved,
        requireAvailableSlot: true,
        bookingTimeZone: timezone,
        agentCallId: agentCall?.id,
        // Who the meeting is with: the member "Call to schedule" named, or
        // whoever started the call (CAL-003).
        responsibleUserId:
          agentCall?.responsibleUserId ?? agentCall?.userId ?? undefined,
      });

      const end = new Date(
        start.getTime() + agent.meetingDurationMinutes * 60_000,
      );

      if (agentCall) {
        // Recorded before the analysis runs: the tool knows a meeting exists,
        // and that fact must survive whatever the transcript analysis concludes.
        // It is also what the duplicate guard above reads on a retry.
        await this.agentCalls.update(agentCall.id, {
          meetingId: meeting.id,
          outcome: AiVoiceAgentOutcome.meeting_booked,
        });
      }

      return {
        ok: true,
        appointment: {
          id: meeting.id,
          start: start.toISOString(),
          end: end.toISOString(),
          ...(meeting.location ? { link: meeting.location } : {}),
        },
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          ok: false,
          error:
            "That time is no longer available. Offer another available time.",
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Booking failed for agent ${agentId} at ${start.toISOString()}: ${message}`,
      );
      return {
        ok: false,
        error: "The meeting could not be created. Offer another time.",
      };
    }
  }

  private async repairAppointmentOutcome(agentCallId: string): Promise<void> {
    const repair = () =>
      this.agentCalls.update(agentCallId, {
        outcome: AiVoiceAgentOutcome.meeting_booked,
      });

    try {
      await repair();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to repair booked outcome for agent call ${agentCallId}: ${message}`,
      );
    }

    try {
      await repair();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Booked outcome repair retry failed for agent call ${agentCallId}: ${message}`,
      );
    }
  }

  async scheduleCallback(
    agentId: string,
    secret: string,
    callControlId: string | null,
    input: { scheduled_at?: string; note?: string },
  ): Promise<ToolResult<ScheduleCallbackResult>> {
    const { agent, ctx } = await this.authorize(agentId, secret);
    if (!callControlId) {
      return {
        ok: false,
        error: "The current call could not be identified for a callback.",
      };
    }

    const scheduledAt = this.parseOffsetDate(input.scheduled_at);
    if (!scheduledAt) {
      return {
        ok: false,
        error:
          "The callback time must be a valid ISO 8601 date and time with a timezone offset.",
      };
    }
    if (scheduledAt.getTime() <= Date.now()) {
      return { ok: false, error: "The callback time is already in the past." };
    }

    const agentCall = await this.agentCalls.findByCallControlId(callControlId);
    if (!agentCall?.callId) {
      return {
        ok: false,
        error: "The current call could not be found for a callback.",
      };
    }
    const grant = await this.handoffs.grantFor(agent, agentCall);
    if (grant.kind === "refused") return this.refuse(grant);
    if (grant.kind === "participant") {
      // A request the worker would withdraw the callback for when it comes
      // due — settled, or its meeting already moved — gets none promised.
      if (!(await this.handoffs.callbackStillWanted(grant.handoff))) {
        return {
          ok: false,
          error:
            "There is nothing left to call back about: the meeting was already moved or the team is handling the request. Do not promise a call back; tell the person the team will follow up.",
        };
      }
      // A specialist continuing a request calls back about that request — not
      // the agent that placed the call, and not with that call's variables.
      return this.scheduleRequestCallback(ctx, {
        agentCall,
        handoffId: grant.handoff.id,
        destinationAgentId: agent.id,
        destinationName: agent.name,
        contactId: grant.handoff.contactId,
        key: `handoff:${grant.handoff.id}:agreed:${agentCall.id}`,
        scheduledAt,
        note: input.note,
      });
    }

    const contactId = await this.resolveContactId(ctx, agentCall);
    if (!contactId) {
      return {
        ok: false,
        error: "There is no contact to schedule this callback for.",
      };
    }

    try {
      const callback = await this.callbacks.scheduleFromVoiceAgent({
        agentCallId: agentCall.id,
        userId: agentCall.userId,
        organizationId: agentCall.organizationId,
        contactId,
        callId: agentCall.callId,
        scheduledAt,
        note: this.supportText(input.note, CALLBACK_NOTE_MAX) || undefined,
      });

      await this.recordCallbackOutcome(agentCall);

      return {
        ok: true,
        callback: {
          id: callback.id,
          scheduled_at: callback.scheduledAt.toISOString(),
          status: callback.status,
        },
        speech_instruction:
          "Confirm the callback date and time naturally, thank the person, and end the call.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Callback scheduling failed for agent ${agentId}: ${message}`,
      );
      return {
        ok: false,
        error:
          "The callback could not be scheduled. Do not promise that the call will happen.",
      };
    }
  }

  private async recordCallbackOutcome(
    agentCall: AiVoiceAgentCall,
  ): Promise<void> {
    try {
      await this.results.applyKnownOutcome(
        agentCall,
        AiVoiceAgentOutcome.callback_scheduled,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to record callback outcome for agent call ${agentCall.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      try {
        await this.results.applyKnownOutcome(
          agentCall,
          AiVoiceAgentOutcome.callback_scheduled,
        );
      } catch (retryError) {
        this.logger.warn(
          `Callback outcome retry failed for agent call ${agentCall.id}: ${
            retryError instanceof Error
              ? retryError.message
              : String(retryError)
          }`,
        );
      }
    }
  }

  /**
   * The lead's explicit answer about attending the meeting a reminder call was
   * placed for (AGENT-017).
   *
   * The model supplies the answer and nothing else that matters: the call is
   * read from the provider-filled header, the meeting from the reminder
   * execution that placed that call, and the schedule version from the same
   * row — so an answer can only land on this call's meeting, and only on the
   * time the person was actually asked about.
   */
  async confirmMeetingAttendance(
    agentId: string,
    secret: string,
    callControlId: string | null,
    input: { attendance?: string; email?: string; note?: string },
  ): Promise<ToolResult<AttendanceResult>> {
    const { agent, ctx } = await this.authorize(agentId, secret);
    const attendance = input.attendance;
    if (attendance !== "confirmed" && attendance !== "declined") {
      return {
        ok: false,
        error:
          'Record the answer as "confirmed" (a clear yes) or "declined" (a clear no).',
      };
    }
    if (!callControlId) {
      return {
        ok: false,
        error: "The current call could not be identified.",
      };
    }

    const agentCall = await this.agentCalls.findByCallControlId(callControlId);
    if (!agentCall) {
      return { ok: false, error: "The current call could not be found." };
    }
    const grant = await this.handoffs.grantFor(agent, agentCall);
    if (grant.kind === "refused") return this.refuse(grant);
    if (grant.kind === "participant") {
      return {
        ok: false,
        error:
          "Attendance is recorded by the assistant that placed this call. Continue without it.",
      };
    }

    const execution = await this.reminderExecutions.findByAgentCallId(
      agentCall.id,
    );
    if (!execution || execution.organizationId !== ctx.organizationId) {
      return {
        ok: false,
        error:
          "This call is not about a scheduled meeting, so there is no attendance to record. Continue the conversation without it.",
      };
    }

    const offeredEmail = input.email?.trim()
      ? normalizeEmail(input.email)
      : null;
    if (input.email?.trim() && !offeredEmail) {
      return {
        ok: false,
        error:
          "That email address is not valid. Read it back to the person and ask again, or continue without it.",
      };
    }

    let recorded;
    try {
      recorded = await this.meetings.recordAttendance(ctx, {
        meetingId: execution.meetingId,
        expectedScheduleVersion: execution.scheduleVersion,
        status: attendance,
        agentCallId: agentCall.id,
        note: this.supportText(input.note, ATTENDANCE_NOTE_MAX) || null,
        leadEmail: offeredEmail,
        executionId: execution.id,
      });
    } catch (error) {
      this.logger.error(
        `Attendance could not be recorded for agent call ${agentCall.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        ok: false,
        error:
          "The answer could not be recorded right now. Do not say it was recorded; tell the person the team will follow up.",
      };
    }

    if (recorded.result !== "recorded") {
      return {
        ok: false,
        error:
          recorded.result === "past"
            ? "This meeting has already started, so there is nothing to confirm. Apologize for the confusion."
            : "This meeting was moved or cancelled after the call started. Do not confirm it; tell the person the team will contact them with the current details.",
      };
    }

    // The tool's answer is the outcome: the analysis that lands minutes later
    // may not overwrite it (AGENT-006).
    await this.recordAttendanceOutcome(
      agentCall,
      attendance === "confirmed"
        ? AiVoiceAgentOutcome.confirmed
        : AiVoiceAgentOutcome.cannot_attend,
    );

    if (attendance === "declined") {
      // Whether this call can continue with the scheduling agent, read now —
      // the same check the handoff preparation repeats.
      const destination = ctx.organizationId
        ? await this.handoffs
            .resolveDestination(
              { userId: ctx.userId, organizationId: ctx.organizationId },
              agent.voiceLanguage,
            )
            .catch(() => null)
        : null;
      return {
        ok: true,
        attendance,
        email: "not_applicable",
        speech_instruction: destination?.ok
          ? `Tell the person their answer is recorded. Then ask once whether they would like to find another time now; ${destination.agent.name} can do it on this call. If they agree, ask what days or times suit them if they have not said, then call prepare_reschedule_handoff. If they would rather not, respect it and end the call. Do not promise a new time yourself.`
          : "Tell the person their answer is recorded and that the team will be told. Do not promise a new time or a response time.",
      };
    }

    const contact = recorded.meeting.leadEmail
      ? null
      : await this.contacts
          .findContactByIdForOwner(ctx, recorded.meeting.contactId)
          .catch(() => null);
    const hasEmail = Boolean(recorded.meeting.leadEmail || contact?.email);
    return {
      ok: true,
      attendance,
      email: hasEmail ? "will_be_sent" : "no_email_on_file",
      speech_instruction: hasEmail
        ? "Tell the person their attendance is confirmed and that a confirmation email will be sent to everyone in the meeting. Do not say it has already been sent."
        : "Tell the person their attendance is confirmed. There is no email address on file, so do not promise an email; if they want one, ask for the address, read it back, and call this tool again with `email` once they confirm it.",
    };
  }

  private async recordAttendanceOutcome(
    agentCall: AiVoiceAgentCall,
    outcome: AiVoiceAgentOutcome,
  ): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.results.applyKnownOutcome(agentCall, outcome);
        return;
      } catch (error) {
        this.logger.warn(
          `Failed to record attendance outcome for agent call ${agentCall.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async requestHumanSupport(
    agentId: string,
    secret: string,
    callControlId: string | null,
    input: { subject?: string; message?: string },
  ): Promise<ToolResult<HumanSupportResult>> {
    const { agent, ctx } = await this.authorize(agentId, secret);
    const subject = this.supportSubject(input.subject);
    const message = this.supportText(input.message, SUPPORT_MESSAGE_MAX);
    if (!subject || !message) {
      return {
        ok: false,
        error:
          "A short subject and a message explaining the requested follow-up are required.",
      };
    }
    if (!callControlId) {
      return {
        ok: false,
        error: "The current call could not be identified for human follow-up.",
      };
    }

    const agentCall = await this.agentCalls.findByCallControlId(callControlId);
    if (!agentCall) {
      return {
        ok: false,
        error: "The current call could not be found for human follow-up.",
      };
    }
    const grant = await this.handoffs.grantFor(agent, agentCall);
    if (grant.kind === "refused") return this.refuse(grant);

    const identity = contactIdentityFromVariables(agentCall.variables);
    const storedContact = agentCall.contactId
      ? await this.contacts
          .findContactByIdForOwner(ctx, agentCall.contactId)
          .catch(() => null)
      : null;
    const name =
      storedContact?.name?.trim() ||
      [identity.firstName, identity.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      null;
    const contact = {
      id: storedContact?.id ?? agentCall.contactId ?? null,
      name,
      phoneNumber: storedContact?.phoneNumber ?? agentCall.toNumber,
      email: storedContact?.email ?? identity.email ?? null,
      company: storedContact?.company ?? null,
    };

    const delivery = await this.humanSupport.notify({
      ctx,
      agent,
      call: agentCall,
      contact,
      subject,
      message,
      // A participant's request is its own: the source may already have
      // asked for help earlier on the same call.
      dedupeScope:
        grant.kind === "participant" ? grant.participant.id : undefined,
    });
    // Recorded on every request, a repeated one included: a duplicate
    // delivery says the team was told, not that this was recorded.
    if (grant.kind === "participant")
      await this.recordIntervention(grant, delivery.delivered);
    if (!delivery.delivered) {
      return {
        ok: false,
        error:
          "Human support could not be notified right now. Do not promise that someone will follow up.",
      };
    }

    return {
      ok: true,
      request: {
        subject,
        notified_recipients: delivery.recipientCount,
        contact_attached: Boolean(
          contact.id || contact.name || contact.email || contact.phoneNumber,
        ),
        already_requested: delivery.duplicate,
      },
      speech_instruction:
        "Tell the person that human follow-up has been requested. Do not promise a response time.",
    };
  }

  /**
   * Records a participant's request for help on its handoff, which suspends
   * the request's automatic callbacks. The team was (or was not) told whatever
   * happens here, so a failure never changes what the person hears. Nothing is
   * marked recorded — the write is one keyed transaction — so a later request
   * records it if every try here fails.
   */
  private async recordIntervention(
    grant: Extract<HandoffGrant, { kind: "participant" }>,
    delivered: boolean,
  ): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.handoffs.recordExceptionalIntervention(grant, delivered);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const delay = INTERVENTION_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          this.logger.error(
            `Could not record the human support request on handoff ${grant.handoff.id} after ${attempt + 1} tries: ${message}`,
          );
          return;
        }
        this.logger.warn(
          `Recording the human support request on handoff ${grant.handoff.id} failed, retrying: ${message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // ── Handoff to the scheduling agent (AGENT-021) ──────────────

  /**
   * The reminders agent asks to hand the call to the scheduling agent, after
   * the person said they cannot attend and agreed to look for another time.
   *
   * Stores the request and its context, and authorizes the destination,
   * before the provider handoff can happen. The model supplies only what the
   * person said: the meeting, its version, the contact and the destination
   * are all derived from the call and the workspace.
   */
  async prepareRescheduleHandoff(
    agentId: string,
    secret: string,
    callControlId: string | null,
    input: {
      person_said?: string;
      preferences?: string;
      identity_confirmed?: boolean | string;
      language?: string;
    },
  ): Promise<ToolResult<RescheduleHandoffResult> & { fallback?: string }> {
    const located = await this.locateRootCall(agentId, secret, callControlId);
    if (!located.ok) return located;
    const { agent, ctx, agentCall } = located;

    const prepared = await this.handoffs.prepareReschedule(
      ctx,
      agent,
      agentCall,
      {
        personSaid: this.optionalText(input.person_said),
        preferences: this.optionalText(input.preferences),
        identityConfirmed:
          input.identity_confirmed === true ||
          input.identity_confirmed === "true",
        language: this.optionalText(input.language),
      },
    );
    if (!prepared.ok) return this.prepareFailure(prepared.code);

    const name = prepared.destination.name;
    const preference = prepared.handoff.preferences
      ? ` and that you have passed on what suits them (${prepared.handoff.preferences})`
      : "";
    return {
      ok: true,
      handoff: { status: "ready", to: name },
      // One reply: a model that ends its turn after the sentence leaves the
      // person in silence until they speak (seen on a real call, 2026-11-03).
      speech_instruction: `In one short sentence, tell the person you are passing them to ${name}, who will find a new time for the meeting${preference}, and ask them to stay on the line. In that same reply, use the handoff tool to hand the call to ${name}: do not wait for them to answer, and say nothing more. If the handoff does not go through, offer that ${name} calls them back: agree an exact time and call schedule_reschedule_callback.`,
    };
  }

  /**
   * The reminders agent still holds the call and agrees a callback by the
   * scheduling agent instead: the handoff did not go through, or the person
   * would rather be called later. The callback is assigned to the scheduling
   * agent and bound to the request; the call is promised only once it exists.
   */
  async scheduleRescheduleCallback(
    agentId: string,
    secret: string,
    callControlId: string | null,
    input: {
      scheduled_at?: string;
      note?: string;
      why?: string;
      person_said?: string;
      preferences?: string;
    },
  ): Promise<ToolResult<ScheduleCallbackResult>> {
    const scheduledAt = this.parseOffsetDate(input.scheduled_at);
    if (!scheduledAt) {
      return {
        ok: false,
        error:
          "The callback time must be a valid ISO 8601 date and time with a timezone offset.",
      };
    }
    if (scheduledAt.getTime() <= Date.now()) {
      return { ok: false, error: "The callback time is already in the past." };
    }
    const located = await this.locateRootCall(agentId, secret, callControlId);
    if (!located.ok) return located;
    const { agent, ctx, agentCall } = located;

    const failed = await this.handoffs.failToCallback(ctx, agent, agentCall, {
      why: input.why,
      personSaid: this.optionalText(input.person_said),
      preferences: this.optionalText(input.preferences),
    });
    if (!failed.ok) {
      return {
        ok: false,
        error:
          failed.code === "meeting_changed"
            ? "This meeting was moved or cancelled after the call started. Do not promise a call back; tell the person the team will contact them with the current details."
            : failed.code === "not_about_a_meeting"
              ? "This call is not about a scheduled meeting. Use schedule_callback instead."
              : "The scheduling assistant cannot call back right now. Do not promise a call back; if the person wants help, call request_human_support.",
      };
    }
    return this.scheduleRequestCallback(ctx, {
      agentCall,
      handoffId: failed.handoff.id,
      destinationAgentId: failed.destination.id,
      destinationName: failed.destination.name,
      contactId: failed.handoff.contactId,
      key: `handoff:${failed.handoff.id}:agreed:${agentCall.id}`,
      scheduledAt,
      note: input.note,
    });
  }

  /**
   * The scheduling agent, having taken a call over or placed a callback for a
   * request, reads what it continues: the meeting, why, what the person
   * already said and how far the call got — rebuilt from stored records. Its
   * first tool call on a handed-over call is also the proof the handoff
   * completed (`VoiceAgentHandoffService.grantFor`).
   */
  async getHandoffContext(
    agentId: string,
    secret: string,
    callControlId: string | null,
  ): Promise<ToolResult<HandoffContextResult>> {
    const { agent, ctx } = await this.authorize(agentId, secret);
    if (!callControlId) {
      return { ok: false, error: "The current call could not be identified." };
    }
    if (!ctx.organizationId) {
      throw new UnauthorizedException("Unknown agent");
    }
    const agentCall = await this.agentCalls.findByCallControlId(callControlId);
    if (!agentCall) {
      return { ok: false, error: "The current call could not be found." };
    }
    const grant = await this.handoffs.grantFor(agent, agentCall);
    if (grant.kind === "root") {
      return {
        ok: false,
        error:
          "Nothing was handed to you on this call. Continue the conversation as usual.",
      };
    }
    if (grant.kind === "refused") return this.refuse(grant);
    const view = await this.handoffs.describe(
      { userId: ctx.userId, organizationId: ctx.organizationId },
      grant,
    );
    if (!view) {
      return {
        ok: false,
        error:
          "The meeting this call is about no longer exists. Apologize, say the team will contact them, and end the call.",
      };
    }
    return { ok: true, ...view };
  }

  /**
   * The scheduling agent moves the meeting it was handed to the time the
   * person agreed (AGENT-021). Only a participant bound to a request may: the
   * meeting, the version it was handed and its calendar come from the
   * request, never from the model, and the time must be one that calendar
   * offers now. The email that says so is created with the move.
   */
  async moveMeeting(
    agentId: string,
    secret: string,
    callControlId: string | null,
    input: { start?: string },
  ): Promise<ToolResult<MoveMeetingResult>> {
    const { agent, ctx } = await this.authorize(agentId, secret);
    if (!ctx.organizationId) {
      throw new UnauthorizedException("Unknown agent");
    }
    const start = this.parseOffsetDate(input.start);
    if (!start) {
      return {
        ok: false,
        error:
          "The start time must be a valid ISO 8601 date and time with a timezone offset, exactly as get_available_slots returned it.",
      };
    }
    if (start.getTime() <= Date.now()) {
      return { ok: false, error: "That time is already in the past." };
    }
    if (!callControlId) {
      return { ok: false, error: "The current call could not be identified." };
    }
    const agentCall = await this.agentCalls.findByCallControlId(callControlId);
    if (!agentCall) {
      return { ok: false, error: "The current call could not be found." };
    }
    const grant = await this.handoffs.grantFor(agent, agentCall);
    if (grant.kind === "root") {
      return {
        ok: false,
        error:
          "There is no meeting to move on this call. Do not say a meeting was moved.",
      };
    }
    if (grant.kind === "refused") return this.refuse(grant);

    const orgCtx: OrganizationOwnershipContext = {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    };
    const meetingId = grant.participant.meetingId ?? grant.handoff.meetingId;
    const expectedScheduleVersion =
      grant.participant.meetingScheduleVersion ??
      grant.handoff.meetingScheduleVersion;

    let outcome: MeetingMoveOutcome;
    let timeZone: string | null = null;
    try {
      // A retry of a move already made finds the meeting one version on, at
      // the time it asks for — past the version gate below. That move stands;
      // only what follows it may be left to finish.
      const repeat = await this.meetings.completeRepeatedMove(orgCtx, {
        meetingId,
        expectedScheduleVersion,
        scheduledAt: start,
      });
      if (repeat) {
        outcome = repeat;
      } else {
        // A request the team is handling, or one already settled, is not
        // this agent's to finish.
        if (
          grant.handoff.requestStatus !==
          AiVoiceAgentHandoffRequestStatus.pending
        ) {
          return {
            ok: false,
            error: `This request was already settled — the meeting was moved, or the team is handling it — so nothing was moved. ${MOVE_FALLS_TO_TEAM}`,
          };
        }
        const scope = await this.handoffs.availabilityFor(orgCtx, grant);
        if (!scope.ok) return { ok: false, error: scope.error };
        if (!scope.excludeMeetingId) {
          // Only a callback reaches a cancelled meeting: bringing it back is
          // a person's decision.
          return {
            ok: false,
            error: `This meeting was cancelled, so it cannot be moved on this call. ${MOVE_FALLS_TO_TEAM}`,
          };
        }
        timeZone = scope.resolved.timezone;
        outcome = await this.meetings.moveForAgent(orgCtx, {
          meetingId: scope.excludeMeetingId,
          expectedScheduleVersion,
          scheduledAt: start,
          resolvedCalendar: scope.resolved,
          durationMinutes: scope.durationMinutes,
          agentCallId: agentCall.id,
        });
      }
    } catch (error) {
      this.logger.error(
        `Moving the meeting of handoff ${grant.handoff.id} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        ok: false,
        error: `The meeting could not be moved right now. ${MOVE_FALLS_TO_TEAM}`,
      };
    }

    if (outcome.result === "unavailable") {
      return {
        ok: false,
        error:
          "That time is no longer available. Call get_available_slots again and offer other times.",
      };
    }
    if (outcome.result === "unchanged") {
      return {
        ok: false,
        error:
          "The meeting is already at that time, so nothing was moved and no email was sent. If they can make that time after all, call request_human_support saying so, and only after it succeeds tell them the team will note it; otherwise offer other times.",
      };
    }
    if (outcome.result !== "moved") {
      return {
        ok: false,
        error:
          "This meeting was changed or cancelled during the call, so it was not moved. Do not offer times; tell the person the team will contact them with the current details.",
      };
    }

    // The request is done. A failure here leaves it for the reconciler,
    // which resolves a request whose meeting moved: the move stands.
    await this.handoffs.resolveMoved(grant.handoff).catch((error: unknown) => {
      this.logger.warn(
        `Could not resolve handoff ${grant.handoff.id} after the move: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    const meeting = outcome.meeting;
    const moved = new Date(meeting.scheduledAt);
    const hasEmail = Boolean(meeting.leadEmail || meeting.contact?.email);
    // A repeat never read availability: its zone is its calendar's.
    timeZone ??= await this.calendars
      .resolveCalendar(orgCtx, {
        calendarId: meeting.calendarId,
        allowArchived: true,
      })
      .then((resolved) => resolved.timezone)
      .catch(() => "UTC");
    return {
      ok: true,
      meeting: {
        start: moved.toISOString(),
        end: new Date(
          moved.getTime() + meeting.duration * 60_000,
        ).toISOString(),
        time_zone: timeZone,
      },
      email: hasEmail ? "will_be_sent" : "no_email_on_file",
      speech_instruction: `Tell the person the meeting is moved to the day and time they chose, said in words as you offered it. ${
        hasEmail
          ? "Say an email with the new time is on its way to everyone in the meeting; do not say it has already been sent."
          : "There is no email address on file for them, so do not promise them an email."
      } Then thank them, say goodbye and end the call.`,
    };
  }

  /** Availability for the meeting a participant was handed (AGENT-021). */
  private async rescheduleSlots(
    ctx: OwnershipContext,
    grant: Extract<HandoffGrant, { kind: "participant" }>,
    date: string,
  ): Promise<ToolResult<AvailableSlotsResult>> {
    if (!ctx.organizationId) {
      throw new UnauthorizedException("Unknown agent");
    }
    const orgCtx: OrganizationOwnershipContext = {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    };
    const scope = await this.handoffs.availabilityFor(orgCtx, grant);
    if (!scope.ok) return { ok: false, error: scope.error };
    try {
      const slots = await this.calendars.getBookableSlotsForCalendar(
        orgCtx,
        scope.resolved,
        {
          date,
          durationMinutes: scope.durationMinutes,
          excludeMeetingId: scope.excludeMeetingId,
        },
      );
      const offered = slots
        .slice(0, MAX_OFFERED_SLOTS)
        .map(({ start, label }) => ({ start, label }));
      await this.handoffs.recordOffer(grant, offered);
      return {
        ok: true,
        timezone: scope.resolved.timezone,
        duration_minutes: scope.durationMinutes,
        speech_instruction: `${NATURAL_SLOT_SPEECH_INSTRUCTION} ${RESCHEDULE_SLOT_SPEECH_INSTRUCTION}`,
        slots: offered,
      };
    } catch (error) {
      this.logger.error(
        `Reschedule availability failed for handoff ${grant.handoff.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        ok: false,
        error:
          "The calendar could not be reached, so no times can be offered right now.",
      };
    }
  }

  /**
   * A callback assigned to the scheduling agent and bound to the request.
   * Replay-safe by key: the same tool call on the same call is the same
   * callback.
   */
  private async scheduleRequestCallback(
    ctx: OwnershipContext,
    input: {
      agentCall: AiVoiceAgentCall;
      handoffId: string;
      destinationAgentId: string;
      destinationName: string;
      contactId: string | null;
      key: string;
      scheduledAt: Date;
      note?: string;
    },
  ): Promise<ToolResult<ScheduleCallbackResult>> {
    if (!ctx.organizationId || !input.contactId) {
      return {
        ok: false,
        error: "There is no contact to schedule this callback for.",
      };
    }
    try {
      let callback = await this.callbacks.scheduleAgentCallback({
        handoffId: input.handoffId,
        agentId: input.destinationAgentId,
        kind: CallbackAgentKind.agreed,
        key: input.key,
        userId: input.agentCall.userId,
        organizationId: ctx.organizationId,
        contactId: input.contactId,
        callId: input.agentCall.callId,
        scheduledAt: input.scheduledAt,
        note:
          this.supportText(input.note, CALLBACK_NOTE_MAX) ||
          "Call back to find a new time for a meeting the contact could not attend.",
      });
      if (callback.status !== CallbackStatus.scheduled) {
        return {
          ok: false,
          error:
            "The call back arranged on this call can no longer be changed. Do not promise another time; tell the person the team will follow up.",
        };
      }
      if (callback.scheduledAt.getTime() !== input.scheduledAt.getTime()) {
        // This call's callback already exists at another time: the person
        // changed the time they agreed to. A callback still waiting moves to
        // it; one already placed, being placed or withdrawn is never revived,
        // and its old time is never confirmed as the new one.
        callback = await this.callbacks.rescheduleAgreedAgentCallback(
          callback.id,
          input.scheduledAt,
          input.handoffId,
        );
      }
      if (
        !(await this.handoffs.callbackStillWanted({
          id: input.handoffId,
          organizationId: ctx.organizationId,
        }))
      ) {
        return {
          ok: false,
          error:
            "There is nothing left to call back about: the meeting was already moved or the team is handling the request. Do not promise a call back; tell the person the team will follow up.",
        };
      }
      await this.recordCallbackOutcome(input.agentCall);
      return {
        ok: true,
        callback: {
          id: callback.id,
          scheduled_at: callback.scheduledAt.toISOString(),
          status: callback.status,
        },
        speech_instruction: `Confirm the date and time of the call back naturally, in the person's time zone, and say that ${input.destinationName} will call to find a new time. Thank them and end the call.`,
      };
    } catch (error) {
      this.logger.error(
        `Reschedule callback failed for handoff ${input.handoffId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        ok: false,
        error:
          "The callback could not be scheduled. Do not promise that the call will happen.",
      };
    }
  }

  /**
   * The source agent's own live call, for the tools only it may use. An agent
   * that already handed the call over is refused, and so is anyone else.
   */
  private async locateRootCall(
    agentId: string,
    secret: string,
    callControlId: string | null,
  ): Promise<
    | {
        ok: true;
        agent: AiVoiceAgent;
        ctx: OrganizationOwnershipContext;
        agentCall: AiVoiceAgentCall;
      }
    | { ok: false; error: string }
  > {
    const { agent, ctx } = await this.authorize(agentId, secret);
    if (!ctx.organizationId) throw new UnauthorizedException("Unknown agent");
    if (!callControlId) {
      return { ok: false, error: "The current call could not be identified." };
    }
    const agentCall = await this.agentCalls.findByCallControlId(callControlId);
    if (!agentCall) {
      return { ok: false, error: "The current call could not be found." };
    }
    const grant = await this.handoffs.grantFor(agent, agentCall);
    if (grant.kind === "refused") return this.refuse(grant);
    if (grant.kind === "participant") {
      return {
        ok: false,
        error:
          "This call was handed to you; only its first assistant uses this tool.",
      };
    }
    return {
      ok: true,
      agent,
      ctx: { userId: ctx.userId, organizationId: ctx.organizationId },
      agentCall,
    };
  }

  /**
   * What a refused participation reads back. An agent the workspace never
   * authorized on the call is refused exactly as before handoffs existed.
   */
  private refuse(grant: Extract<HandoffGrant, { kind: "refused" }>): {
    ok: false;
    error: string;
  } {
    switch (grant.reason) {
      case "handed_off":
        return {
          ok: false,
          error:
            "This conversation was handed to another assistant. Do not act on it any more.",
        };
      case "call_ended":
        return { ok: false, error: "The call is no longer active." };
      case "handoff_failed":
        return {
          ok: false,
          error:
            "This call was not handed to you. Say the team will follow up, and end the call politely.",
        };
      case "destination_unavailable":
        return {
          ok: false,
          error:
            "Finding a new time is not available on this call right now. Do not offer times; say the team will follow up, and end the call politely.",
        };
      case "not_participant":
        throw new UnauthorizedException("Call does not belong to this agent");
    }
  }

  private prepareFailure(code: PrepareRescheduleFailure): {
    ok: false;
    error: string;
    fallback?: string;
  } {
    switch (code) {
      case "not_about_a_meeting":
        return {
          ok: false,
          error:
            "This call is not about a scheduled meeting, so it cannot be handed over. Continue without it.",
        };
      case "meeting_changed":
        return {
          ok: false,
          error:
            "This meeting was moved or cancelled after the call started. Do not offer a new time; tell the person the team will contact them with the current details.",
        };
      case "call_ended":
        return { ok: false, error: "The call is no longer active." };
      case "handoff_already_failed":
        return {
          ok: false,
          fallback: "callback",
          error:
            "Handing over did not work on this call. Offer that the scheduling assistant calls them back: agree an exact time and call schedule_reschedule_callback.",
        };
      default:
        // The destination itself is unavailable: it could not call back
        // either, so nothing is promised.
        return {
          ok: false,
          fallback: "human_support",
          error:
            "Finding a new time is not available right now. Tell the person their answer is recorded and that the team will follow up; if they want a person, call request_human_support. Do not hand the call over.",
        };
    }
  }

  // ── Authorization ────────────────────────────────────────────

  /**
   * The provider presents the agent's shared secret. Everything else about the
   * request — which workspace, which calendar, which call — is read from the
   * stored agent, so a forged body cannot reach another tenant's data.
   */
  private async authorize(
    agentId: string,
    secret: string,
  ): Promise<{ agent: AiVoiceAgent; ctx: OwnershipContext }> {
    const agent = await this.agents.findByIdForToolCallback(agentId);
    if (!agent?.toolSecretHash || agent.deletedAt) {
      throw new UnauthorizedException("Unknown agent");
    }
    if (!secret || !safeHashEqual(agent.toolSecretHash, hashApiKey(secret))) {
      this.logger.warn(
        `Rejected a tool call for agent ${agentId} (bad secret)`,
      );
      throw new UnauthorizedException("Invalid tool credentials");
    }
    return {
      agent,
      ctx: { userId: agent.userId, organizationId: agent.organizationId },
    };
  }

  // ── Helpers ──────────────────────────────────────────────────

  private requireDate(date: string | undefined): string {
    const value = date?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException("A date in YYYY-MM-DD form is required.");
    }
    return value;
  }

  /** A model can send anything: only a non-blank string is a time. */
  private parseStart(start: unknown): Date | null {
    if (typeof start !== "string" || !start.trim()) return null;
    const parsed = new Date(start.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseOffsetDate(value: unknown): Date | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
      return null;
    }
    return this.parseStart(trimmed);
  }

  private supportText(value: string | undefined, maxLength: number): string {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }

  private optionalText(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  private supportSubject(value: string | undefined): string {
    return this.supportText(value, SUPPORT_SUBJECT_MAX).replace(/\s+/g, " ");
  }

  /** The calendar date on which an instant falls in the agent's time zone. */
  private dateInTimeZone(instant: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((value) => value.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  /**
   * The contact the meeting is booked for. Normally the one resolved when the
   * call was placed; a call whose contact lookup failed falls back to the
   * number itself so the booking still happens.
   */
  private async resolveContactId(
    ctx: OwnershipContext,
    agentCall: AiVoiceAgentCall | null,
  ): Promise<string | null> {
    if (agentCall?.contactId) return agentCall.contactId;
    if (!agentCall?.toNumber) return null;

    const contact = await this.contacts
      .findOrCreateByPhone(ctx, agentCall.toNumber, {
        ...contactIdentityFromVariables(agentCall.variables),
        source: AI_VOICE_AGENT_CONTACT_SOURCE,
      })
      .catch(() => null);
    if (!contact) return null;

    await this.agentCalls.update(agentCall.id, { contactId: contact.id });
    return contact.id;
  }
}
