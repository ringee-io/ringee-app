import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import {
  MeetingRepository,
  CallRepository,
  Meeting,
  MeetingStatus,
  CallOutcome,
  Call,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { CalendarService } from "./calendar.service";

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly callRepo: CallRepository,
    private readonly calendarService: CalendarService,
  ) {}

  private ensureOrganization(ctx: OwnershipContext): void {
    if (!ctx.organizationId) {
      throw new ForbiddenException("Meetings require an organization");
    }
  }

  async createMeeting(
    ctx: OwnershipContext,
    dto: {
      contactId: string;
      callId?: string;
      callSessionId?: string;
      title?: string;
      scheduledAt: string;
      duration?: number;
      location?: string;
      notes?: string;
      attendeeEmail?: string;
      calendarProvider?: "google" | "microsoft";
    },
  ): Promise<Meeting> {
    let resolvedCallId = dto.callId;
    if (!resolvedCallId && dto.callSessionId) {
      const call = await this.callRepo.findOneBySessionId(dto.callSessionId);
      resolvedCallId = call?.id;
    }

    const meeting = await this.meetingRepo.create(ctx, {
      contactId: dto.contactId,
      callId: resolvedCallId,
      title: dto.title,
      scheduledAt: new Date(dto.scheduledAt),
      duration: dto.duration,
      location: dto.location,
      notes: dto.notes,
    });

    // Auto-set call outcome to meeting_booked if linked to a call
    if (resolvedCallId) {
      const call = await this.callRepo.findById(resolvedCallId);
      if (call) {
        await this.callRepo.updateOutcome(call.id, CallOutcome.meeting_booked);
      }
    }

    // Best-effort: push to external calendar (Google/Microsoft)
    try {
      const result = await this.calendarService.createCalendarEvent(ctx, {
        meetingId: meeting.id,
        title: dto.title || "Meeting via Ringee",
        scheduledAt: dto.scheduledAt,
        duration: dto.duration || 30,
        attendeeEmail: dto.attendeeEmail,
        provider: dto.calendarProvider as any,
      });
      this.logger.log(
        `Synced meeting ${meeting.id} to external calendar: ${result.externalEventId}`,
      );
    } catch (err) {
      // No calendar connected or API error — don't block meeting creation
      this.logger.debug(
        `Skipped calendar sync for meeting ${meeting.id}: ${(err as Error).message}`,
      );
    }

    return meeting;
  }

  async getMeetingById(ctx: OwnershipContext, id: string): Promise<Meeting> {
    const meeting = await this.meetingRepo.findById(id);
    if (!meeting) throw new NotFoundException("Meeting not found");

    if (ctx.organizationId && meeting.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }
    if (!ctx.organizationId && meeting.userId !== ctx.userId) {
      throw new ForbiddenException("Access denied");
    }

    return meeting;
  }

  async listMeetings(
    ctx: OwnershipContext,
    options?: {
      status?: MeetingStatus;
      upcoming?: boolean;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.meetingRepo.listByOwner(ctx, options);
  }

  async upcomingThisWeek(ctx: OwnershipContext) {
    return this.meetingRepo.upcomingThisWeek(ctx);
  }

  async updateMeeting(
    ctx: OwnershipContext,
    id: string,
    dto: {
      title?: string;
      scheduledAt?: string;
      duration?: number;
      location?: string;
      notes?: string;
    },
  ): Promise<Meeting> {
    const meeting = await this.getMeetingById(ctx, id);

    return this.meetingRepo.update(meeting.id, {
      title: dto.title,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      duration: dto.duration,
      location: dto.location,
      notes: dto.notes,
    });
  }

  async cancelMeeting(ctx: OwnershipContext, id: string): Promise<Meeting> {
    const meeting = await this.getMeetingById(ctx, id);

    return this.meetingRepo.update(meeting.id, {
      status: MeetingStatus.cancelled,
      cancelledAt: new Date(),
    });
  }

  async findCallBySessionId(sessionId: string): Promise<Call | null> {
    return this.callRepo.findOneBySessionId(sessionId);
  }

  async updateCallOutcome(
    ctx: OwnershipContext,
    callId: string,
    dto: {
      outcome: CallOutcome;
      outcomeNote?: string;
    },
  ) : Promise<Call> {
    const call = await this.callRepo.findById(callId);
    if (!call) throw new NotFoundException("Call not found");

    if (ctx.organizationId && call.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }
    if (!ctx.organizationId && call.userId !== ctx.userId) {
      throw new ForbiddenException("Access denied");
    }

    return this.callRepo.updateOutcome(callId, dto.outcome, dto.outcomeNote);
  }
}
