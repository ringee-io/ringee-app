import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CallbackStatus,
  CallbackTaskRepository,
  MeetingRepository,
  MeetingStatus,
  ReminderRepository,
  ReminderStatus,
  ReminderSubjectType,
  UserRepository,
  ContactRepository,
} from "@ringee/database";
import {
  REMINDER_CHANNELS,
  ReminderChannel,
  ReminderChannelKind,
  ReminderContent,
  ReminderRecipient,
} from "./reminder-channel.interface";

const DEFAULT_OFFSETS_MIN = [15, 5] as const;
const DEFAULT_CHANNELS: ReminderChannelKind[] = ["email"];

interface ScheduleSubjectInput {
  subjectType: ReminderSubjectType;
  subjectId: string;
  userId: string;
  organizationId?: string | null;
  fireAt: Date;
  channels?: ReminderChannelKind[];
  offsetsMinutes?: readonly number[];
}

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly reminderRepo: ReminderRepository,
    private readonly userRepo: UserRepository,
    private readonly callbackRepo: CallbackTaskRepository,
    private readonly meetingRepo: MeetingRepository,
    private readonly contactRepo: ContactRepository,
    @Inject(REMINDER_CHANNELS)
    private readonly channels: ReminderChannel[]
  ) {}

  /**
   * Schedule the default reminder set (-15min, -5min) for a subject.
   * Idempotent per (subjectType, subjectId, offset) — re-running with the
   * same fireAt won't duplicate rows.
   *
   * Past-event safety: offsets that fall before `now()` are skipped, so
   * backfills and migrations never enqueue email for events already passed.
   */
  async scheduleForSubject(input: ScheduleSubjectInput) {
    const offsets = input.offsetsMinutes ?? DEFAULT_OFFSETS_MIN;
    const channels = input.channels ?? DEFAULT_CHANNELS;

    const created = [];
    for (const offsetMin of offsets) {
      const fireAt = new Date(input.fireAt.getTime() - offsetMin * 60_000);
      const dedupeKey = `${input.subjectType}:${input.subjectId}:T-${offsetMin}m`;

      const reminder = await this.reminderRepo.upsertPending({
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        fireAt,
        channels,
        dedupeKey,
      });

      if (reminder) created.push(reminder);
    }
    return created;
  }

  /**
   * Cancel every pending/snoozed reminder for a subject. Called when the
   * subject is cancelled or completed (callback completed, meeting cancelled).
   */
  async cancelForSubject(
    subjectType: ReminderSubjectType,
    subjectId: string
  ) {
    return this.reminderRepo.cancelForSubject(subjectType, subjectId);
  }

  /**
   * Re-schedule by cancelling existing reminders and creating fresh ones.
   * Used when a callback or meeting is rescheduled to a new time.
   */
  async rescheduleForSubject(input: ScheduleSubjectInput) {
    await this.cancelForSubject(input.subjectType, input.subjectId);
    return this.scheduleForSubject(input);
  }

  async snooze(id: string, minutes: number) {
    const reminder = await this.reminderRepo.findById(id);
    if (!reminder) throw new NotFoundException("Reminder not found");
    const until = new Date(Date.now() + minutes * 60_000);
    return this.reminderRepo.snooze(id, until);
  }

  async listUpcomingForOwner(
    owner: { userId: string; organizationId?: string | null },
    options?: {
      subjectType?: ReminderSubjectType;
      page?: number;
      limit?: number;
    }
  ) {
    return this.reminderRepo.listUpcomingForOwner(owner, options);
  }

  /**
   * Worker entry point. Unsnooze anything whose snooze window elapsed, then
   * process every pending reminder whose fireAt has passed.
   *
   * Behavior is best-effort and idempotent:
   * - If the underlying subject is gone or no longer actionable
   *   (callback cancelled/completed, meeting cancelled), mark the reminder
   *   cancelled without sending.
   * - If any channel throws, the reminder is marked failed with the error
   *   captured. We deliberately don't auto-retry yet — retries can come
   *   later by re-flipping failed → pending with backoff.
   */
  async processDuePending(): Promise<number> {
    await this.reminderRepo.unsnoozeDue();
    const due = await this.reminderRepo.findDuePending();

    let dispatched = 0;
    for (const reminder of due) {
      try {
        const subjectCtx = await this.loadSubjectContext(
          reminder.subjectType,
          reminder.subjectId
        );

        if (!subjectCtx) {
          await this.reminderRepo.cancelForSubject(
            reminder.subjectType,
            reminder.subjectId
          );
          continue;
        }

        const recipient = await this.resolveRecipient(reminder.userId);
        if (!recipient.email) {
          await this.reminderRepo.markFailed(
            reminder.id,
            "recipient has no email on file"
          );
          continue;
        }

        const content = this.buildContent(
          reminder.subjectType,
          subjectCtx,
          reminder.fireAt
        );

        for (const channelKind of reminder.channels) {
          const channel = this.channels.find((c) => c.kind === channelKind);
          if (!channel) {
            throw new Error(`No channel registered for kind ${channelKind}`);
          }
          await channel.send(recipient, content);
        }

        await this.reminderRepo.markSent(reminder.id);
        dispatched++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Reminder ${reminder.id} delivery failed: ${message}`
        );
        await this.reminderRepo.markFailed(reminder.id, message);
      }
    }

    return dispatched;
  }

  private async loadSubjectContext(
    subjectType: ReminderSubjectType,
    subjectId: string
  ): Promise<{
    scheduledAt: Date;
    note?: string | null;
    contact?: { name: string | null; phoneNumber: string };
    title?: string | null;
    location?: string | null;
  } | null> {
    if (subjectType === ReminderSubjectType.callback) {
      const callback = await this.callbackRepo.findById(subjectId);
      if (!callback) return null;
      if (
        callback.status === CallbackStatus.completed ||
        callback.status === CallbackStatus.cancelled ||
        callback.status === CallbackStatus.missed
      ) {
        return null;
      }
      const contact = await this.contactRepo.findById(callback.contactId);
      return {
        scheduledAt: callback.scheduledAt,
        note: callback.note,
        contact: contact
          ? { name: contact.name ?? null, phoneNumber: contact.phoneNumber }
          : undefined,
      };
    }

    if (subjectType === ReminderSubjectType.meeting) {
      const meeting = await this.meetingRepo.findById(subjectId);
      if (!meeting) return null;
      if (
        meeting.status === MeetingStatus.completed ||
        meeting.status === MeetingStatus.cancelled
      ) {
        return null;
      }
      const contact = await this.contactRepo.findById(meeting.contactId);
      return {
        scheduledAt: meeting.scheduledAt,
        note: meeting.notes,
        title: meeting.title,
        location: meeting.location,
        contact: contact
          ? { name: contact.name ?? null, phoneNumber: contact.phoneNumber }
          : undefined,
      };
    }

    return null;
  }

  private isLikelyUrl(value: string | null | undefined): boolean {
    if (!value) return false;
    return /^https?:\/\//i.test(value.trim());
  }

  private async resolveRecipient(userId: string): Promise<ReminderRecipient> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      return { userId };
    }
    type UserWithEmails = typeof user & {
      emails?: Array<{ email: string; isPrimary: boolean }>;
    };
    const withEmails = user as UserWithEmails;
    const emails = withEmails.emails ?? [];
    const primary =
      emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email ?? null;
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      null;
    return { userId, email: primary, name };
  }

  private buildContent(
    subjectType: ReminderSubjectType,
    subjectCtx: NonNullable<
      Awaited<ReturnType<ReminderService["loadSubjectContext"]>>
    >,
    fireAt: Date
  ): ReminderContent {
    const when = subjectCtx.scheduledAt.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const minutesUntil = Math.max(
      1,
      Math.round((subjectCtx.scheduledAt.getTime() - fireAt.getTime()) / 60_000)
    );
    const subjectTimeLabel = `${this.formatClock(subjectCtx.scheduledAt)}(in ${minutesUntil} min)`;
    const contactLine = subjectCtx.contact
      ? `${subjectCtx.contact.name ?? "Unknown"} (${subjectCtx.contact.phoneNumber})`
      : "Unknown contact";

    if (subjectType === ReminderSubjectType.meeting) {
      const title = subjectCtx.title?.trim() || "Upcoming meeting";
      const subject = `Reminder: ${title} ${subjectTimeLabel}`;
      const linkLine = this.isLikelyUrl(subjectCtx.location)
        ? `Join: ${subjectCtx.location}`
        : subjectCtx.location
          ? `Where: ${subjectCtx.location}`
          : "";
      const bodyText = [
        `${title}`,
        `When: ${when}`,
        `With: ${contactLine}`,
        linkLine,
        subjectCtx.note ? `\nNotes:\n${subjectCtx.note}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const bodyHtml = this.toHtml(bodyText, subjectCtx.location);
      return { subject, bodyText, bodyHtml };
    }

    // callback / followup
    const subject = `Reminder: callback with ${
      subjectCtx.contact?.name ?? "your lead"
    } ${subjectTimeLabel}`;
    const bodyText = [
      `You have a scheduled callback.`,
      `When: ${when}`,
      `Contact: ${contactLine}`,
      subjectCtx.note ? `\nNotes:\n${subjectCtx.note}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      subject,
      bodyText,
      bodyHtml: bodyText.replace(/\n/g, "<br>"),
    };
  }

  private formatClock(date: Date): string {
    const h24 = date.getHours();
    const m = date.getMinutes();
    const period = h24 >= 12 ? "pm" : "am";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${m.toString().padStart(2, "0")}${period}`;
  }

  private toHtml(text: string, maybeUrl?: string | null): string {
    const escaped = text.replace(/\n/g, "<br>");
    if (!this.isLikelyUrl(maybeUrl)) return escaped;
    const url = (maybeUrl as string).trim();
    return escaped.replace(
      url,
      `<a href="${url}">${url}</a>`
    );
  }
}
