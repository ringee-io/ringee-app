import {
  forwardRef,
  Inject,
  Injectable,
  ConflictException,
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
import { CrmCallLogService } from "./crm/crm-call-log.service";
import { CrmMeetingSyncService } from "./crm/crm-meeting-sync.service";
import { ReminderService } from "./reminders/reminder.service";
import { ContactRepository } from "@ringee/database";
import { CustomIntegrationOutboundService } from "./custom-integrations/custom-integration-outbound.service";
import {
  buildCallOutcomeData,
  buildMeetingEventData,
  callOwnershipFromCall,
} from "./custom-integrations/custom-integration-event-builders";
import { PipelineFanoutService } from "./ai-pipeline";

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
    private readonly contactRepo: ContactRepository,
    private readonly customIntegrationOutbound: CustomIntegrationOutboundService,
    private readonly pipelineFanout: PipelineFanoutService,
    private readonly crmCallLog: CrmCallLogService,
  ) {}

  private async enqueueMeetingCreated(meeting: Meeting): Promise<void> {
    const ctx = {
      userId: meeting.userId,
      organizationId: meeting.organizationId,
    };
    const contact = await this.contactRepo.findById(meeting.contactId);
    void this.customIntegrationOutbound.enqueue({
      ctx,
      eventEnum: "meeting_created",
      subjectId: meeting.id,
      data: buildMeetingEventData(meeting, contact),
    });
  }

  private async enqueueOutcomeUpdated(
    call: Call,
    meetingUrl?: string | null,
  ): Promise<void> {
    // AI Pipeline: fan out the finalized outcome to enabled pipelines (counters
    // + Layer 1 rule actions). Fire-and-forget; never blocks the outcome write.
    this.pipelineFanout.handleCallFinalized(call.id);

    // CRM: fold the finalized outcome + notes + duration (+ meeting link, when
    // a meeting was booked) into the held call-log note and push it now.
    void this.crmCallLog
      .enqueueOutcomeUpdate(call.id, { meetingUrl: meetingUrl ?? null })
      .catch((err: Error) =>
        this.logger.warn(
          `crm outcome update failed for call ${call.id}: ${err.message}`,
        ),
      );

    const ctx = callOwnershipFromCall(call);
    if (!ctx) return;
    void this.customIntegrationOutbound.enqueue({
      ctx,
      eventEnum: "call_outcome_updated",
      subjectId: call.id,
      data: buildCallOutcomeData(call),
    });
  }

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
      calendarIntegrationId?: string | null;
      requireAvailableSlot?: boolean;
    },
  ): Promise<Meeting> {
    const meetingData = {
      contactId: dto.contactId,
      callId: dto.callId,
      title: dto.title,
      scheduledAt: new Date(dto.scheduledAt),
      duration: dto.duration,
      location: dto.location,
      notes: dto.notes,
    };
    const meeting = dto.requireAvailableSlot
      ? await this.meetingRepo.createIfAvailable(ctx, meetingData)
      : await this.meetingRepo.create(ctx, meetingData);
    if (!meeting) {
      throw new ConflictException("That time is no longer available.");
    }

    // Auto-set call outcome to meeting_booked if linked to a call. Fold the
    // fanout in below, AFTER the calendar event, so the Meet link makes it into
    // the same call-log note.
    let bookedCall: Call | null = null;
    if (dto.callId) {
      const call = await this.callRepo.findById(dto.callId);
      if (call) {
        bookedCall = await this.callRepo.updateOutcome(
          call.id,
          CallOutcome.meeting_booked,
        );
      }
    }

    // Custom Integrations: meeting.created (independent of outcome)
    await this.enqueueMeetingCreated(meeting);

    // Best-effort: push to external calendar (Google/Microsoft)
    let calendarResult: { externalEventId: string; meetLink?: string } | null =
      null;
    try {
      calendarResult = await this.calendarService.createCalendarEvent(ctx, {
        meetingId: meeting.id,
        title: dto.title || "Meeting via Ringee",
        scheduledAt: dto.scheduledAt,
        duration: dto.duration || 30,
        attendeeEmail: dto.attendeeEmail,
        provider: dto.calendarProvider as any,
        integrationId: dto.calendarIntegrationId,
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

    // Now that we have the Meet link, fan out the meeting_booked outcome so the
    // call-log note carries the join URL alongside the disposition.
    if (bookedCall) {
      await this.enqueueOutcomeUpdated(
        bookedCall,
        calendarResult?.meetLink ?? null,
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

    // `createCalendarEvent` persists these fields after Ringee creates the
    // meeting. Reflect them in this response as well so tool callers receive
    // the Meet/Teams link without needing a second read.
    return calendarResult
      ? {
          ...meeting,
          externalEventId: calendarResult.externalEventId,
          location: calendarResult.meetLink ?? meeting.location,
        }
      : meeting;
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
      userId?: string;
      scheduledFrom?: Date;
      scheduledTo?: Date;
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
  ): Promise<Call> {
    const call = await this.assertCallAccess(ctx, callId);

    const updated = await this.callRepo.updateOutcome(
      call.id,
      dto.outcome,
      dto.outcomeNote,
    );
    await this.enqueueOutcomeUpdated(updated);
    return updated;
  }

  /**
   * Post-call view closed/skipped with NO outcome — same request the outcome
   * save uses (POST /meetings/call-outcome), just without an outcome. Pushes
   * the CRM call-log note immediately with whatever the call already carries.
   * Without this request the note of an answered dialer call never fires.
   */
  async finalizeCall(ctx: OwnershipContext, callId: string): Promise<Call> {
    const call = await this.assertCallAccess(ctx, callId);

    // Only the CRM note fires here: with no outcome there is nothing for the
    // AI pipeline or custom-integration outcome events to fan out.
    void this.crmCallLog
      .enqueueOutcomeUpdate(call.id)
      .catch((err: Error) =>
        this.logger.warn(
          `crm finalize failed for call ${call.id}: ${err.message}`,
        ),
      );
    return call;
  }

  private async assertCallAccess(
    ctx: OwnershipContext,
    callId: string,
  ): Promise<Call> {
    const call = await this.callRepo.findById(callId);
    if (!call) throw new NotFoundException("Call not found");

    if (ctx.organizationId && call.organizationId !== ctx.organizationId) {
      throw new ForbiddenException("Access denied");
    }
    if (!ctx.organizationId && call.userId !== ctx.userId) {
      throw new ForbiddenException("Access denied");
    }
    return call;
  }
}
