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
}): Date | null {
  const { meetingAt, offsetMinutes, window, timeZone, notBefore } = params;
  if (window.endMinute <= window.startMinute || window.days.length === 0) {
    return null;
  }
  // Leave a scheduler tick and preparation margin before the hard dial cutoff.
  // Existing shorter policies are pulled earlier too; they never bypass it.
  const leadMinutes = Math.max(offsetMinutes, REMINDER_OFFSET_MIN_MINUTES + 5);
  const ideal = new Date(meetingAt.getTime() - leadMinutes * 60_000);
  if (ideal.getTime() <= notBefore.getTime()) return null;
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
    return pulled.getTime() > notBefore.getTime() ? pulled : null;
  }
  return null;
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
