import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  CalendarRepository,
  CallbackStatus,
  CallbackTaskRepository,
  Meeting,
  MeetingReminderExecutionRepository,
  MeetingReminderPolicy,
  MeetingReminderPolicyRepository,
  MeetingRepository,
  MeetingStatus,
  Prisma,
  ReminderRepository,
  ReminderStatus,
  ReminderSubjectType,
  UserRepository,
  ContactRepository,
} from "@ringee/database";
import type { OrganizationOwnershipContext } from "@ringee/platform";
import { voiceAgentAutomationsEnabled } from "../voice-agents/automations/automation-access";
import {
  REMINDER_CHANNELS,
  ReminderChannel,
  ReminderChannelKind,
  ReminderContent,
  ReminderRecipient,
} from "./reminder-channel.interface";
import {
  DEFAULT_CALLING_WINDOW,
  planReminderCallAt,
  readCallingWindow,
} from "./reminder-call-schedule";

/**
 * How far ahead of "now" a reminder call must be to be planned at all. A call
 * planned for this very minute would ring while the person is still on the
 * screen that created the meeting.
 */
const CALL_PLANNING_MARGIN_MS = 2 * 60_000;

/** The idempotency key of one planned reminder call (AGENT-019). */
export function reminderCallKey(parts: {
  meetingId: string;
  scheduleVersion: number;
  policyId: string;
  policyVersion: number;
  offsetMinutes: number;
  attempt: number;
}): string {
  return [
    "meeting",
    parts.meetingId,
    `v${parts.scheduleVersion}`,
    "policy",
    parts.policyId,
    `p${parts.policyVersion}`,
    `T-${parts.offsetMinutes}m`,
    `a${parts.attempt}`,
  ].join(":");
}

const DEFAULT_OFFSETS_MIN = [15, 5] as const;
const DEFAULT_CHANNELS: ReminderChannelKind[] = ["email", "in_app"];

// Defaults applied when a user has no stored notificationPreferences row.
// New users opt into everything until they explicitly disable a category.
const DEFAULT_NOTIFICATION_PREFS = {
  callbacks: true,
  meetings: true,
  missedCalls: true,
} as const;

interface NotificationPreferences {
  callbacks: boolean;
  meetings: boolean;
  missedCalls: boolean;
}

function parsePrefs(raw: unknown): NotificationPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_NOTIFICATION_PREFS };
  const obj = raw as Record<string, unknown>;
  const pick = (k: keyof NotificationPreferences) =>
    typeof obj[k] === "boolean"
      ? (obj[k] as boolean)
      : DEFAULT_NOTIFICATION_PREFS[k];
  return {
    callbacks: pick("callbacks"),
    meetings: pick("meetings"),
    missedCalls: pick("missedCalls"),
  };
}

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
    private readonly channels: ReminderChannel[],
    private readonly calendarRepo: CalendarRepository,
    private readonly callPolicies: MeetingReminderPolicyRepository,
    private readonly callExecutions: MeetingReminderExecutionRepository,
  ) {}

  // ── Reminder calls (AGENT-019) ──────────────────────────────────────
  //
  // The email/push reminders above go to the person who scheduled. These go
  // to the lead, as a call from a reminders agent, and are planned as durable
  // executions the voice worker claims one at a time — never as a channel on
  // the rows above, which have no claim and are best-effort.

  /**
   * Plans the reminder calls one meeting is owed under its calendar's enabled
   * policy. Idempotent: the same meeting version and offset plan once, and an
   * offset that already has a call is never planned a second time.
   */
  async planMeetingCalls(meeting: Meeting): Promise<number> {
    if (
      !meeting.organizationId ||
      !voiceAgentAutomationsEnabled(meeting.organizationId) ||
      (meeting.status !== MeetingStatus.scheduled &&
        meeting.status !== MeetingStatus.rescheduled)
    ) {
      return 0;
    }
    const ctx: OrganizationOwnershipContext = {
      userId: meeting.userId,
      organizationId: meeting.organizationId,
    };
    const calendar = meeting.calendarId
      ? await this.calendarRepo.findByIdForOwner(ctx, meeting.calendarId)
      : await this.calendarRepo.findDefault(ctx);
    if (!calendar) return 0;
    const policy = await this.callPolicies.findEnabledForCalendar(calendar.id);
    if (!policy || policy.organizationId !== meeting.organizationId) return 0;

    const used = await this.callExecutions.listUsedOffsets([meeting.id]);
    return this.callExecutions.createMany(
      this.callsFor(meeting, policy, calendar.timezone, used, new Date()),
    );
  }

  /**
   * After a meeting moved or changed hands: withdraw what was planned for its
   * old version and plan the new one.
   */
  async replanMeetingCalls(meeting: Meeting): Promise<number> {
    await this.callExecutions.cancelScheduled(
      { meetingId: meeting.id, exceptScheduleVersion: meeting.scheduleVersion },
      "meeting_changed",
    );
    return this.planMeetingCalls(meeting);
  }

  /** The meeting is gone or cancelled: nothing planned for it may ring. */
  cancelMeetingCalls(meetingId: string, reason: string): Promise<number> {
    return this.callExecutions.cancelScheduled({ meetingId }, reason);
  }

  /**
   * Plans calls for every upcoming meeting a policy covers — what switching a
   * policy on does. Offsets already behind us are not planned: activating a
   * policy never calls anyone late.
   */
  async planPolicyCalls(
    ctx: OrganizationOwnershipContext,
    policy: MeetingReminderPolicy,
  ): Promise<number> {
    if (!policy.enabled || !voiceAgentAutomationsEnabled(ctx.organizationId)) {
      return 0;
    }
    const calendar = await this.calendarRepo.findByIdForOwner(
      ctx,
      policy.calendarId,
    );
    if (!calendar || calendar.archivedAt) return 0;
    const now = new Date();
    let planned = 0;
    for await (const meetings of this.upcomingMeetingPages(
      ctx,
      calendar,
      now,
    )) {
      const used = await this.callExecutions.listUsedOffsets(
        meetings.map((meeting) => meeting.id),
      );
      planned += await this.callExecutions.createMany(
        meetings.flatMap((meeting) =>
          this.callsFor(meeting, policy, calendar.timezone, used, now),
        ),
      );
    }
    return planned;
  }

  private async *upcomingMeetingPages(
    ctx: OrganizationOwnershipContext,
    calendar: { id: string; isDefault: boolean },
    now: Date,
  ): AsyncGenerator<Meeting[]> {
    const take = 500;
    let afterCursor: { scheduledAt: Date; id: string } | undefined;
    while (true) {
      const page = await this.meetingRepo.listUpcomingOnCalendars(ctx, {
        calendarIds: [calendar.id],
        includeUnassigned: calendar.isDefault,
        after: now,
        take,
        afterCursor,
      });
      if (!page.length) return;
      yield page;
      if (page.length < take) return;
      const last = page[page.length - 1]!;
      afterCursor = { scheduledAt: last.scheduledAt, id: last.id };
    }
  }

  /** A paused or replaced policy withdraws what it had planned. */
  cancelPolicyCalls(policyId: string, reason: string): Promise<number> {
    return this.callExecutions.cancelScheduled({ policyId }, reason);
  }

  /**
   * What switching a policy on would do, before it is switched on: how many
   * upcoming meetings its calendars hold, and how many of them would still get
   * a call — the rest are too close for the chosen lead time, and are never
   * called late.
   */
  async previewPolicyCalls(
    ctx: OrganizationOwnershipContext,
    input: { calendarIds: string[]; offsetMinutes: number },
  ): Promise<{ meetings: number; calls: number }> {
    const now = new Date();
    const notBefore = new Date(now.getTime() + CALL_PLANNING_MARGIN_MS);
    let meetings = 0;
    let calls = 0;
    for (const calendarId of new Set(input.calendarIds)) {
      const calendar = await this.calendarRepo.findByIdForOwner(
        ctx,
        calendarId,
      );
      if (!calendar || calendar.archivedAt) continue;
      const existing = await this.callPolicies.findForCalendar(ctx, calendarId);
      const window = existing
        ? readCallingWindow(existing)
        : DEFAULT_CALLING_WINDOW;
      for await (const page of this.upcomingMeetingPages(ctx, calendar, now)) {
        const upcoming = page.filter(
          (meeting) => meeting.attendanceStatus === "pending",
        );
        meetings += upcoming.length;
        calls += upcoming.filter((meeting) =>
          planReminderCallAt({
            meetingAt: meeting.scheduledAt,
            offsetMinutes: input.offsetMinutes,
            window,
            timeZone: calendar.timezone,
            notBefore,
          }),
        ).length;
      }
    }
    return { meetings, calls };
  }

  private callsFor(
    meeting: Meeting,
    policy: MeetingReminderPolicy,
    timeZone: string,
    used: Array<{
      meetingId: string;
      scheduleVersion: number;
      offsetMinutes: number | null;
    }>,
    now: Date,
  ): Prisma.MeetingReminderExecutionCreateManyInput[] {
    if (!meeting.organizationId) return [];
    // An answer already given for this version needs no reminder.
    if (meeting.attendanceStatus !== "pending") return [];
    const window = readCallingWindow(policy);
    const notBefore = new Date(
      Math.max(now.getTime(), policy.activatedAt.getTime()) +
        CALL_PLANNING_MARGIN_MS,
    );
    return policy.offsetsMinutes.flatMap((offsetMinutes) => {
      const alreadyCalled = used.some(
        (row) =>
          row.meetingId === meeting.id &&
          row.scheduleVersion === meeting.scheduleVersion &&
          row.offsetMinutes === offsetMinutes,
      );
      if (alreadyCalled) return [];
      const fireAt = planReminderCallAt({
        meetingAt: meeting.scheduledAt,
        offsetMinutes,
        window,
        timeZone,
        notBefore,
      });
      if (!fireAt) return [];
      return [
        {
          // Placed as the admin who switched the policy on: the call is the
          // automation's, accountable to whoever configured it.
          userId: policy.userId,
          organizationId: meeting.organizationId!,
          meetingId: meeting.id,
          policyId: policy.id,
          agentId: policy.agentId,
          trigger: "policy",
          scheduleVersion: meeting.scheduleVersion,
          policyVersion: policy.version,
          offsetMinutes,
          attempt: 1,
          idempotencyKey: reminderCallKey({
            meetingId: meeting.id,
            scheduleVersion: meeting.scheduleVersion,
            policyId: policy.id,
            policyVersion: policy.version,
            offsetMinutes,
            attempt: 1,
          }),
          fireAt,
        },
      ];
    });
  }

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
  async cancelForSubject(subjectType: ReminderSubjectType, subjectId: string) {
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
    },
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
          reminder.subjectId,
        );

        if (!subjectCtx) {
          await this.reminderRepo.cancelForSubject(
            reminder.subjectType,
            reminder.subjectId,
          );
          continue;
        }

        const user = await this.userRepo.findById(reminder.userId);
        const prefs = parsePrefs(
          (user as { notificationPreferences?: unknown } | null)
            ?.notificationPreferences,
        );

        // Preferences only gate push notifications — email is always sent
        // so the user never misses a reminder for an event they scheduled.
        const pushAllowed =
          (reminder.subjectType === ReminderSubjectType.callback &&
            prefs.callbacks) ||
          (reminder.subjectType === ReminderSubjectType.meeting &&
            prefs.meetings);

        const recipient = await this.resolveRecipient(reminder.userId);
        const content = this.buildContent(
          reminder.subjectType,
          subjectCtx,
          reminder.fireAt,
        );

        // Attach a route hint so the push channel can deep-link the user
        // back into the relevant subject when they tap the notification.
        const pushData: Record<string, string> = {};
        if (reminder.subjectType === ReminderSubjectType.callback) {
          pushData.type = "CALLBACK_REMINDER";
          pushData.callbackId = reminder.subjectId;
          pushData.subjectId = reminder.subjectId;
        } else if (reminder.subjectType === ReminderSubjectType.meeting) {
          pushData.type = "MEETING_REMINDER";
          pushData.meetingId = reminder.subjectId;
          pushData.subjectId = reminder.subjectId;
        }
        const contentWithPush: ReminderContent = { ...content, pushData };

        let anySent = false;
        const errors: string[] = [];

        for (const channelKind of reminder.channels) {
          if (channelKind === "in_app" && !pushAllowed) continue;
          const channel = this.channels.find((c) => c.kind === channelKind);
          if (!channel) {
            errors.push(`No channel registered for kind ${channelKind}`);
            continue;
          }
          try {
            await channel.send(recipient, contentWithPush);
            anySent = true;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`${channelKind}: ${message}`);
          }
        }

        if (anySent) {
          await this.reminderRepo.markSent(reminder.id);
          dispatched++;
        } else {
          await this.reminderRepo.markFailed(
            reminder.id,
            errors.join("; ") || "no channels delivered",
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Reminder ${reminder.id} delivery failed: ${message}`,
        );
        await this.reminderRepo.markFailed(reminder.id, message);
      }
    }

    return dispatched;
  }

  private async loadSubjectContext(
    subjectType: ReminderSubjectType,
    subjectId: string,
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
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null;
    return { userId, email: primary, name };
  }

  private buildContent(
    subjectType: ReminderSubjectType,
    subjectCtx: NonNullable<
      Awaited<ReturnType<ReminderService["loadSubjectContext"]>>
    >,
    fireAt: Date,
  ): ReminderContent {
    const when = subjectCtx.scheduledAt.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const minutesUntil = Math.max(
      1,
      Math.round(
        (subjectCtx.scheduledAt.getTime() - fireAt.getTime()) / 60_000,
      ),
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
    return escaped.replace(url, `<a href="${url}">${url}</a>`);
  }
}
