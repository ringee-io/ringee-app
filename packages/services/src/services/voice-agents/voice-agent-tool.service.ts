import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AiVoiceAgent,
  AiVoiceAgentCall,
  AiVoiceAgentCallRepository,
  AiVoiceAgentOutcome,
  AiVoiceAgentRepository,
} from "@ringee/database";
import {
  hashApiKey,
  safeHashEqual,
  type OwnershipContext,
} from "@ringee/platform";
import { CalendarService, ResolvedCalendar } from "../calendar.service";
import { ContactService } from "../contact.service";
import { MeetingService } from "../meeting.service";
import { CallbackService } from "../outbound/callback.service";
import {
  AI_VOICE_AGENT_CONTACT_SOURCE,
  contactIdentityFromVariables,
} from "./voice-agent.types";
import { VoiceAgentHumanSupportService } from "./voice-agent-human-support.service";
import { VoiceAgentResultService } from "./voice-agent-result.service";

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

export interface HumanSupportResult {
  request: {
    subject: string;
    notified_recipients: number;
    contact_attached: boolean;
    already_requested: boolean;
  };
  speech_instruction: string;
}

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
  ) {}

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
    if (agentCall && agentCall.agentId !== agent.id) {
      throw new UnauthorizedException("Call does not belong to this agent");
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
    if (agentCall && agentCall.agentId !== agent.id) {
      // The call named by the header belongs to a different agent: refuse
      // rather than book against someone else's conversation.
      throw new UnauthorizedException("Call does not belong to this agent");
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
    if (agentCall.agentId !== agent.id) {
      throw new UnauthorizedException("Call does not belong to this agent");
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
    if (agentCall.agentId !== agent.id) {
      throw new UnauthorizedException("Call does not belong to this agent");
    }

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
    });
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

  private parseStart(start: string | undefined): Date | null {
    if (!start?.trim()) return null;
    const parsed = new Date(start.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseOffsetDate(value: string | undefined): Date | null {
    const trimmed = value?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
      return null;
    }
    return this.parseStart(trimmed);
  }

  private supportText(value: string | undefined, maxLength: number): string {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
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
