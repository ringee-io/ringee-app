'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek
} from 'date-fns';
import { formatForDisplay } from '@ringee/dialer-core/phone';
import type {
  CalendarMeeting,
  CalendarView,
  RingeeCalendar,
  ReminderPlan
} from './types';

/** The day the grid shows when nothing falls outside it: 8 AM to 7 PM. */
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 19;
/** 48 px per hour: a meeting's height is its length. */
export const HOUR_PX = 48;
/** Moving a meeting snaps to a quarter of an hour. */
export const SNAP_MINUTES = 15;
export const DURATIONS = [15, 30, 45, 60] as const;

const WEEK = { weekStartsOn: 1 } as const;

export const dateKey = (date: Date) => format(date, 'yyyy-MM-dd');

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** "HH:mm" for minutes after midnight. */
export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** That day at "HH:mm", local. */
export function atTime(date: Date, time: string): Date {
  const at = startOfDay(date);
  at.setMinutes(minutesOf(time));
  return at;
}

export const meetingStart = (m: CalendarMeeting) => new Date(m.scheduledAt);
export const meetingEnd = (m: CalendarMeeting) =>
  new Date(new Date(m.scheduledAt).getTime() + m.duration * 60_000);

export const isLive = (m: CalendarMeeting) =>
  m.status === 'scheduled' || m.status === 'rescheduled';

export const isUpcoming = (m: CalendarMeeting, now: Date) =>
  isLive(m) && meetingStart(m) > now;

export const isWeekend = (date: Date) =>
  date.getDay() === 0 || date.getDay() === 6;

/** Who the meeting is with, as people read it. */
export function contactName(m: CalendarMeeting): string {
  const c = m.contact;
  return (
    c.name?.trim() ||
    [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
    formatForDisplay(c.phoneNumber)
  );
}

export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((part) => /\p{L}/u.test(part[0] ?? ''))
    .map((part) => part[0]!.toUpperCase());
  return letters.slice(0, 2).join('') || '#';
}

/**
 * The calendar a meeting belongs to. Meetings booked before calendars
 * existed belong to the workspace's default one, as their capacity does.
 */
export function calendarIdOf(
  m: CalendarMeeting,
  defaultId: string | null
): string | null {
  return m.calendar?.id ?? defaultId;
}

export function findCalendar(
  calendars: RingeeCalendar[],
  id: string | null
): RingeeCalendar | null {
  return calendars.find((calendar) => calendar.id === id) ?? null;
}

/** When the AI agent calls to confirm, if it will and it is still ahead. */
export function aiCallAt(
  m: CalendarMeeting,
  plan: ReminderPlan | null,
  calendarId: string | null,
  now: Date,
  start: Date = meetingStart(m)
): Date | null {
  if (!plan || !calendarId || !plan.calendarIds.has(calendarId)) return null;
  const at = new Date(start.getTime() - plan.offsetMinutes * 60_000);
  return at > now ? at : null;
}

/** The first and last instant the view shows, to load its meetings. */
export function viewRange(view: CalendarView, anchor: Date) {
  if (view === 'day') {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  if (view === 'week') {
    const from = startOfWeek(anchor, WEEK);
    return { from, to: addDays(from, 7) };
  }
  const from = startOfWeek(startOfMonth(anchor), WEEK);
  const to = addDays(startOfDay(endOfWeek(endOfMonth(anchor), WEEK)), 1);
  return { from, to };
}

export function weekDays(anchor: Date): Date[] {
  const monday = startOfWeek(anchor, WEEK);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function monthDays(anchor: Date): Date[] {
  const { from, to } = viewRange('month', anchor);
  const days: Date[] = [];
  for (let day = from; day < to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Whether a day is on screen in the view. */
export function inView(view: CalendarView, anchor: Date, date: Date) {
  const { from, to } = viewRange(view, anchor);
  if (view === 'month')
    return (
      date.getMonth() === anchor.getMonth() &&
      date.getFullYear() === anchor.getFullYear()
    );
  return date >= from && date < to;
}

/**
 * Side-by-side lanes for meetings that overlap on one day, so two at the
 * same time are both visible.
 */
export function layoutLanes(
  meetings: CalendarMeeting[]
): Map<string, { lane: number; lanes: number }> {
  const sorted = [...meetings].sort(
    (a, b) =>
      meetingStart(a).getTime() - meetingStart(b).getTime() ||
      b.duration - a.duration
  );
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const item of cluster)
      out.set(item.id, { lane: item.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const m of sorted) {
    const start = meetingStart(m).getTime();
    const end = meetingEnd(m).getTime();
    if (start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    cluster.push({ id: m.id, lane });
    clusterEnd = Math.max(clusterEnd === -Infinity ? end : clusterEnd, end);
  }
  flush();
  return out;
}

/** The hours the grid spans: 8 AM to 7 PM, wider if a meeting falls outside. */
export function gridHours(meetings: CalendarMeeting[], extra: Date[] = []) {
  let start = DAY_START_HOUR;
  let end = DAY_END_HOUR;
  for (const m of meetings) {
    const s = meetingStart(m);
    const startMinutes = s.getHours() * 60 + s.getMinutes();
    const endMinutes = Math.min(24 * 60, startMinutes + m.duration);
    start = Math.min(start, Math.floor(startMinutes / 60));
    end = Math.max(end, Math.ceil(endMinutes / 60));
  }
  for (const at of extra) {
    start = Math.min(start, at.getHours());
    end = Math.max(end, Math.min(24, at.getHours() + 1));
  }
  return { start, end };
}

/** Dates and times the way the calendar shows them, in the user's zone. */
export function useCalendarFormat() {
  const locale = useLocale();
  return useMemo(() => {
    const make = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, options);
    const time = make({ hour: 'numeric', minute: '2-digit' });
    const hour = make({ hour: 'numeric' });
    const weekday = make({ weekday: 'short' });
    const weekdayLong = make({ weekday: 'long' });
    const shortDay = make({ weekday: 'short', month: 'short', day: 'numeric' });
    const shortDayYear = make({
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const longDay = make({
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    const monthDay = make({ month: 'short', day: 'numeric' });
    const monthYear = make({ month: 'long', year: 'numeric' });
    const dateOnly = make({ month: 'short', day: 'numeric', year: 'numeric' });

    return {
      /** "1:00 PM". */
      time: (date: Date) => time.format(date),
      /** "1:00" — the time without AM/PM, where space is short. */
      timeShort: (date: Date) =>
        time
          .formatToParts(date)
          .filter((part) => part.type !== 'dayPeriod')
          .map((part) => part.value)
          .join('')
          .trim(),
      /** "8 AM" — or "8:00" where the clock has 24 hours. */
      hour: (h: number) => {
        const at = new Date(2026, 0, 1, h);
        const cycle = time.resolvedOptions().hourCycle;
        return cycle === 'h23' || cycle === 'h24'
          ? time.format(at)
          : hour.format(at);
      },
      /** "Mon". */
      weekday: (date: Date) => weekday.format(date),
      /** "Saturday". */
      weekdayLong: (date: Date) => weekdayLong.format(date),
      /** "Fri, Nov 6". */
      shortDay: (date: Date) => shortDay.format(date),
      /** "Fri, Nov 20, 2026". */
      shortDayYear: (date: Date) => shortDayYear.format(date),
      /** "Friday, November 6, 2026". */
      longDay: (date: Date) => longDay.format(date),
      /** "Nov 6". */
      monthDay: (date: Date) => monthDay.format(date),
      /** "November 2026". */
      monthYear: (date: Date) => monthYear.format(date),
      /** "Nov 3, 2026". */
      date: (date: Date) => dateOnly.format(date),
      /** "Nov 2 to 8": the week's ends. */
      weekEnds: (from: Date, to: Date) => ({
        start: monthDay.format(from),
        end:
          from.getMonth() === to.getMonth()
            ? String(to.getDate())
            : monthDay.format(to),
        year: to.getFullYear()
      }),
      /** "+1 (617) 555-0133". */
      phone: (phoneNumber: string) => formatForDisplay(phoneNumber)
    };
  }, [locale]);
}

/** The browser's own zone, which the availability API reads times in. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
