import {
  BadRequestException,
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
import { CalendarService } from "../calendar.service";
import { ContactService } from "../contact.service";
import { MeetingService } from "../meeting.service";
import {
  AI_VOICE_AGENT_CONTACT_SOURCE,
  contactIdentityFromVariables,
} from "./voice-agent.types";

/**
 * Headers the provider sends: the shared secret it holds for this agent, and
 * the call it is on, filled from a system variable rather than by the model.
 */
export const VOICE_AGENT_TOOL_SECRET_HEADER = "x-ringee-tool-secret";
export const VOICE_AGENT_CALL_ID_HEADER = "x-ringee-call-control-id";

/** How many times to offer at once (§9: offer few slots at a time). */
const MAX_OFFERED_SLOTS = 3;

/** Result shapes the model reads back. Failures are data, not exceptions. */
export type ToolResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export interface AvailableSlotsResult {
  timezone: string;
  duration_minutes: number;
  slots: Array<{ start: string; label: string }>;
}

export interface BookAppointmentResult {
  appointment: { id: string; start: string; end: string; link?: string };
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
  ) {}

  async getAvailableSlots(
    agentId: string,
    secret: string,
    input: { date?: string },
  ): Promise<ToolResult<AvailableSlotsResult>> {
    const { agent, ctx } = await this.authorize(agentId, secret);
    const date = this.requireDate(input.date);
    const timezone = agent.timezone || "UTC";

    try {
      const slots = await this.calendars.getBookableSlots(ctx, {
        date,
        timeZone: timezone,
        durationMinutes: agent.meetingDurationMinutes,
      });

      return {
        ok: true,
        timezone,
        duration_minutes: agent.meetingDurationMinutes,
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

    try {
      const meeting = await this.meetings.createMeeting(ctx, {
        contactId,
        callId: agentCall?.callId ?? undefined,
        title: agent.meetingTitle || "Meeting",
        scheduledAt: start.toISOString(),
        duration: agent.meetingDurationMinutes,
        notes: input.notes,
        attendeeEmail: input.attendee_email,
        calendarIntegrationId: agent.calendarIntegrationId,
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
          outcome: AiVoiceAgentOutcome.appointment_booked,
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
