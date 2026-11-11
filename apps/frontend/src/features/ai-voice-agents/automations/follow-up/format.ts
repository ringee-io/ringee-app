import type { CallingWindow } from '../types';

/**
 * Display helpers for the follow-up review. Times a person reads as theirs
 * are formatted in the browser (`next-intl` runs in UTC on the server).
 */

/** Sunday 2026-11-08 + n: a fixed week to name weekdays with Intl. */
function weekday(day: number, locale: string, style: 'short' | 'long'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: style,
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(2026, 10, 8 + day)));
}

export function formatMinute(minute: number, locale: string): string {
  const date = new Date(Date.UTC(2026, 10, 8, 0, 0) + minute * 60_000);
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC'
  }).format(date);
}

/** "Mon–Fri" for consecutive days, otherwise "Mon, Wed, Fri". */
export function formatDays(days: number[], locale: string): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) {
    return `${weekday(0, locale, 'short')}–${weekday(6, locale, 'short')}`;
  }
  const consecutive =
    sorted.length > 2 &&
    sorted.every((day, index) => index === 0 || day === sorted[index - 1]! + 1);
  if (consecutive) {
    return `${weekday(sorted[0]!, locale, 'short')}–${weekday(
      sorted[sorted.length - 1]!,
      locale,
      'short'
    )}`;
  }
  return sorted.map((day) => weekday(day, locale, 'short')).join(', ');
}

export function formatWindow(window: CallingWindow, locale: string) {
  return {
    days: formatDays(window.days, locale),
    start: formatMinute(window.startMinute, locale),
    end: formatMinute(window.endMinute, locale)
  };
}

/** "Miami (GMT-5)" — the zone's city and its current offset. */
export function formatZone(zone: string, locale: string): string {
  const city = (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      timeZoneName: 'shortOffset'
    }).formatToParts(new Date());
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value;
    return offset ? `${city} (${offset})` : city;
  } catch {
    return city;
  }
}

/** A moment in the browser's own zone: "Fri, Nov 6, 9:00 AM". */
export function formatMoment(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

export function offsetHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function formatUsd(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

/** The browser's IANA zone, proposed for a calendar that has none yet. */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Every IANA zone the browser knows, for the time-zone picker. */
export function timeZoneOptions(current: string): string[] {
  try {
    const all = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (all?.length) return all.includes(current) ? all : [current, ...all];
  } catch {
    // Older browsers: only the current zone.
  }
  return [current];
}
