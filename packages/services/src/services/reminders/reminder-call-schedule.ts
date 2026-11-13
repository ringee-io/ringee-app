import { REMINDER_OFFSET_MIN_MINUTES } from "@ringee/platform";
import { zonedTimeToUtc } from "../calendar.service";

/**
 * When a reminder call may ring, as wall-clock minutes and weekdays in the
 * calendar's own time zone. `endMinute` is exclusive.
 */
export interface CallingWindow {
  startMinute: number;
  endMinute: number;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
}

/** 09:00–20:00 every day: what a policy gets unless it says otherwise. */
export const DEFAULT_CALLING_WINDOW: CallingWindow = {
  startMinute: 9 * 60,
  endMinute: 20 * 60,
  days: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * What the shared follow-up review proposes for a calendar that has no policy
 * yet (Stage 4C): weekdays, 09:00–18:00 in the calendar's time zone. Shown and
 * editable before adoption; an existing policy keeps its own window.
 */
export const PROPOSED_CALLING_WINDOW: CallingWindow = {
  startMinute: 9 * 60,
  endMinute: 18 * 60,
  days: [1, 2, 3, 4, 5],
};

/**
 * Whether a reminder policy covers a meeting (Stage 4C). A policy without
 * `coversMeetingsFrom` covers every meeting on its calendar, as policies always
 * did. One adopted for "new bookings only" covers meetings created from that
 * moment, plus those explicitly included — never an older booking by
 * accident, also not when it later moves or the policy is resumed.
 */
export function policyCoversMeeting(
  policy: {
    coversMeetingsFrom?: Date | null;
    includedMeetingIds?: string[] | null;
  },
  meeting: { id: string; createdAt: Date },
): boolean {
  if (!policy.coversMeetingsFrom) return true;
  if (meeting.createdAt.getTime() >= policy.coversMeetingsFrom.getTime()) {
    return true;
  }
  return (policy.includedMeetingIds ?? []).includes(meeting.id);
}

/**
 * How far back a reminder may be pulled to land inside the window. A window
 * that leaves no minute in a whole week has nothing to offer.
 */
const MAX_PULL_EARLIER_DAYS = 7;

/**
 * How long before the window closes a reminder pulled earlier is placed. The
 * last open minute leaves the worker no room: a tick that runs late, a batch
 * that spills into the next tick, a retry or a "lead on a call" deferral would
 * all land after the close, and the call would be skipped.
 */
const CLOSING_SLACK_MINUTES = 30;

/** The calendar date and minute of day an instant reads as in a zone. */
export function zonedClock(
  instant: Date,
  timeZone: string,
): { date: string; weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const date = `${read("year")}-${read("month")}-${read("day")}`;
  return {
    date,
    weekday: weekdayOf(date),
    minute: Number(read("hour")) * 60 + Number(read("minute")),
  };
}

export function isWithinCallingWindow(
  instant: Date,
  window: CallingWindow,
  timeZone: string,
): boolean {
  const { weekday, minute } = zonedClock(instant, timeZone);
  return (
    window.days.includes(weekday) &&
    minute >= window.startMinute &&
    minute < window.endMinute
  );
}

/**
 * When to place the reminder call for one meeting and offset.
 *
 * The call goes `offsetMinutes` before the meeting. When that moment falls
 * outside the calling window it is pulled *earlier*, to half an hour before
 * the window last closed (never before it opened) — a reminder may arrive a
 * little early, never late and never at night. Null when there is no such
 * moment after `notBefore`: an offset that has already passed is not called
 * late (AGENT-019).
 */
export function planReminderCallAt(params: {
  meetingAt: Date;
  offsetMinutes: number;
  window: CallingWindow;
  timeZone: string;
  notBefore: Date;
  allowNearMeeting?: boolean;
}): Date | null {
  const { meetingAt, offsetMinutes, window, timeZone, notBefore } = params;
  if (window.endMinute <= window.startMinute || window.days.length === 0) {
    return null;
  }
  // Leave a scheduler tick and preparation margin before the hard dial cutoff.
  // Existing shorter policies are pulled earlier too; they never bypass it.
  const leadMinutes = Math.max(offsetMinutes, REMINDER_OFFSET_MIN_MINUTES + 5);
  const ideal = new Date(meetingAt.getTime() - leadMinutes * 60_000);
  // A close meeting's next authorized window, while 20 minutes still remain:
  // what a policy that allows it gets when its own moment cannot be called.
  const nearMeeting = () => {
    if (!params.allowNearMeeting) return null;
    const next = nextCallingWindowMoment(notBefore, window, timeZone);
    return next && meetingAt.getTime() - next.getTime() >= 20 * 60_000
      ? next
      : null;
  };
  if (ideal.getTime() <= notBefore.getTime()) return nearMeeting();
  if (isWithinCallingWindow(ideal, window, timeZone)) return ideal;

  const { date } = zonedClock(ideal, timeZone);
  const pullToMinute = Math.max(
    window.startMinute,
    window.endMinute - CLOSING_SLACK_MINUTES,
  );
  for (let back = 0; back <= MAX_PULL_EARLIER_DAYS; back++) {
    const day = shiftDate(date, -back);
    if (!window.days.includes(weekdayOf(day))) continue;
    const pulled = zonedTimeToUtc(
      day,
      Math.floor(pullToMinute / 60),
      pullToMinute % 60,
      timeZone,
    );
    // On the meeting's own day that moment may come after the ideal one, which
    // means the ideal is before the window opened: look at the day before.
    if (pulled.getTime() > ideal.getTime()) continue;
    return pulled.getTime() > notBefore.getTime() ? pulled : nearMeeting();
  }
  return nearMeeting();
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

function shiftDate(date: string, days: number): string {
  const noon = new Date(`${date}T12:00:00.000Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}

/** Reads a stored window, falling back to the default for anything invalid. */
export function readCallingWindow(policy: {
  windowStartMinute: number;
  windowEndMinute: number;
  windowDays: number[];
}): CallingWindow {
  const start = policy.windowStartMinute;
  const end = policy.windowEndMinute;
  const days = policy.windowDays.filter(
    (day) => Number.isInteger(day) && day >= 0 && day <= 6,
  );
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > 24 * 60 ||
    end <= start ||
    days.length === 0
  ) {
    return DEFAULT_CALLING_WINDOW;
  }
  return { startMinute: start, endMinute: end, days };
}

/**
 * The first moment at or after `after` when a call may ring: `after` itself
 * when it is inside the window, else the next opening — but never in the last
 * half hour before a close, so a late tick or a deferral still lands inside.
 * Null when the window offers nothing within a week.
 */
export function nextCallingWindowMoment(
  after: Date,
  window: CallingWindow,
  timeZone: string,
): Date | null {
  if (window.endMinute <= window.startMinute || window.days.length === 0) {
    return null;
  }
  const lastStart = Math.max(
    window.startMinute,
    window.endMinute - CLOSING_SLACK_MINUTES,
  );
  const { date, weekday, minute } = zonedClock(after, timeZone);
  if (
    window.days.includes(weekday) &&
    minute >= window.startMinute &&
    minute < lastStart
  ) {
    return after;
  }
  for (let ahead = 0; ahead <= MAX_PULL_EARLIER_DAYS; ahead++) {
    const day = shiftDate(date, ahead);
    if (!window.days.includes(weekdayOf(day))) continue;
    const opening = zonedTimeToUtc(
      day,
      Math.floor(window.startMinute / 60),
      window.startMinute % 60,
      timeZone,
    );
    if (opening.getTime() > after.getTime()) return opening;
  }
  return null;
}
