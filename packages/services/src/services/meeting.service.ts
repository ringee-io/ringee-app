import {
  forwardRef,
  Inject,
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
  ReminderSubjectType,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { CalendarService } from "./calendar.service";
import { CrmMeetingSyncService } from "./crm/crm-meeting-sync.service";
import { ReminderService } from "./reminders/reminder.service";

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    private readonly meetingRepo: MeetingRepository,
    private readonly callRepo: CallRepository,
    private readonly calendarService: CalendarService,
    private readonly crmMeetingSync: CrmMeetingSyncService,
    @Inject(forwardRef(() => ReminderService))
    private readonly reminderService: ReminderService,
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
      title?: string;
      scheduledAt: string;
      duration?: number;
      location?: string;
      notes?: string;
      attendeeEmail?: string;
      calendarProvider?: "google" | "microsoft";
    },
  ): Promise<Meeting> {
    const meeting = await this.meetingRepo.create(ctx, {
      contactId: dto.contactId,
      callId: dto.callId,
      title: dto.title,
      scheduledAt: new Date(dto.scheduledAt),
      duration: dto.duration,
      location: dto.location,
      notes: dto.notes,
    });

    // Auto-set call outcome to meeting_booked if linked to a call
    if (dto.callId) {
      const call = await this.callRepo.findById(dto.callId);
      if (call) {
        await this.callRepo.updateOutcome(call.id, CallOutcome.meeting_booked);
      }
    }

    // Best-effort: push to external calendar (Google/Microsoft)
    let calendarResult: { externalEventId: string; meetLink?: string } | null = null;
    try {
      calendarResult = await this.calendarService.createCalendarEvent(ctx, {
        meetingId: meeting.id,
        title: dto.title || "Meeting via Ringee",
        scheduledAt: dto.scheduledAt,
        duration: dto.duration || 30,
        attendeeEmail: dto.attendeeEmail,
        provider: dto.calendarProvider as any,
      });
      this.logger.log(
        `Synced meeting ${meeting.id} to external calendar: ${calendarResult.externalEventId}`,
      );
    } catch (err) {
      // No calendar connected or API error — don't block meeting creation
      this.logger.debug(
        `Skipped calendar sync for meeting ${meeting.id}: ${(err as Error).message}`,
      );
    }

    // Best-effort: sync to active CRM integrations
    try {
      await this.crmMeetingSync.enqueueMeetingSync(ctx, meeting, {
        calendarProvider: dto.calendarProvider ?? null,
        calendarEventId: calendarResult?.externalEventId ?? null,
        meetingUrl: calendarResult?.meetLink ?? null,
        attendeeEmail: dto.attendeeEmail ?? null,
      });
    } catch (err) {
      this.logger.debug(
        `Skipped CRM meeting sync for meeting ${meeting.id}: ${(err as Error).message}`,
      );
    }

    // Best-effort: schedule reminders (-15min, -5min email by default)
    try {
      await this.reminderService.scheduleForSubject({
        subjectType: ReminderSubjectType.meeting,
        subjectId: meeting.id,
        userId: meeting.userId,
        organizationId: meeting.organizationId,
        fireAt: meeting.scheduledAt,
      });
    } catch (err) {
      this.logger.debug(
        `Skipped reminder scheduling for meeting ${meeting.id}: ${(err as Error).message}`,
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

    const updated = await this.meetingRepo.update(meeting.id, {
      title: dto.title,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      duration: dto.duration,
      location: dto.location,
      notes: dto.notes,
    });

    if (dto.scheduledAt) {
      try {
        await this.reminderService.rescheduleForSubject({
          subjectType: ReminderSubjectType.meeting,
          subjectId: meeting.id,
          userId: meeting.userId,
          organizationId: meeting.organizationId,
          fireAt: new Date(dto.scheduledAt),
        });
      } catch (err) {
        this.logger.debug(
          `Skipped reminder reschedule for meeting ${meeting.id}: ${(err as Error).message}`,
        );
      }
    }

    return updated;
  }

  async cancelMeeting(ctx: OwnershipContext, id: string): Promise<Meeting> {
    const meeting = await this.getMeetingById(ctx, id);

    const updated = await this.meetingRepo.update(meeting.id, {
      status: MeetingStatus.cancelled,
      cancelledAt: new Date(),
    });

    try {
      await this.reminderService.cancelForSubject(
        ReminderSubjectType.meeting,
        meeting.id,
      );
    } catch (err) {
      this.logger.debug(
        `Skipped reminder cancel for meeting ${meeting.id}: ${(err as Error).message}`,
      );
    }

    return updated;
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
