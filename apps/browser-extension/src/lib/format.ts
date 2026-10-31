/** Small presentation helpers for the side-panel "Today" feed. */

/** "2:30 PM" in the user's locale. */
export function formatTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "10:30 AM" today; "Oct 6, 10:30 AM" any other day. */
export function formatDayTime(date: Date, now: Date): string {
  return new Intl.DateTimeFormat(
    undefined,
    sameDay(date, now)
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  ).format(date);
}

const UNIT_SECONDS = {
  second: 1,
  minute: 60,
  hour: 60 * 60,
  day: 24 * 60 * 60,
  week: 7 * 24 * 60 * 60,
} as const;

/** "12 minutes ago", picking the unit the way the web app's formatter does. */
export function formatAgo(date: Date, now: Date): string {
  const seconds = (date.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(seconds);
  const unit: keyof typeof UNIT_SECONDS =
    abs < UNIT_SECONDS.minute
      ? "second"
      : abs < UNIT_SECONDS.hour
        ? "minute"
        : abs < UNIT_SECONDS.day
          ? "hour"
          : abs < UNIT_SECONDS.week
            ? "day"
            : "week";
  return new Intl.RelativeTimeFormat(undefined, {
    // Only "now" reads better in words; "1 day ago" stays exact.
    numeric: unit === "second" ? "auto" : "always",
  }).format(Math.round(seconds / UNIT_SECONDS[unit]), unit);
}

/** The time where the person is, only when their zone is known. */
export function formatLocalTime(
  timezone: string | null,
  now: Date,
): string | null {
  if (!timezone) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(now);
  } catch {
    return null;
  }
}

/** "Spain" for "ES"; the code itself when the browser can't name it. */
export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return (
      new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

/** "3 calls", "1 call" — the panel's copy is English. */
export function plural(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}

/** "3:05" from a seconds count; "—" when unknown/zero. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** A human label for a stored CallOutcome. */
export function outcomeLabel(
  outcome: string | null | undefined,
): string | null {
  if (!outcome) return null;
  const map: Record<string, string> = {
    meeting_booked: "Meeting booked",
    sale: "Sale",
    interested: "Interested",
    follow_up: "Follow up",
    callback_scheduled: "Callback",
    not_interested: "Not interested",
    no_answer: "No answer",
    no_conversation: "No conversation",
    voicemail: "Voicemail",
    wrong_number: "Wrong number",
    gatekeeper: "Gatekeeper",
  };
  return map[outcome] ?? outcome.replace(/_/g, " ");
}

/** Positive outcomes get an emerald chip; dead-ends a muted one. */
export function outcomeIsPositive(outcome: string | null | undefined): boolean {
  return (
    !!outcome &&
    ["meeting_booked", "sale", "interested", "follow_up"].includes(outcome)
  );
}
