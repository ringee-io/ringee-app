/** Lead-time presets the rail offers first; anything else is "custom". */
export const OFFSET_PRESETS = [24 * 60, 2 * 60] as const;

export function splitOffset(total: number): {
  days: number;
  hours: number;
  minutes: number;
} {
  const days = Math.floor(total / (24 * 60));
  const hours = Math.floor((total % (24 * 60)) / 60);
  return { days, hours, minutes: total % 60 };
}

export function joinOffset(parts: {
  days: number;
  hours: number;
  minutes: number;
}): number {
  return parts.days * 24 * 60 + parts.hours * 60 + parts.minutes;
}

/** "1 d 3 h", "24 h", "45 min", in the units the copy provides. */
export function formatOffset(
  total: number,
  units: { day: string; hour: string; minute: string }
): string {
  const { days, hours, minutes } = splitOffset(total);
  // A whole number of days under three reads better in hours ("24 h").
  if (days > 0 && days < 3 && hours === 0 && minutes === 0) {
    return `${days * 24} ${units.hour}`;
  }
  return [
    days ? `${days} ${units.day}` : null,
    hours ? `${hours} ${units.hour}` : null,
    minutes ? `${minutes} ${units.minute}` : null
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * A moment the person reads as theirs: formatted in the browser's own zone,
 * after the data loaded on the client (next-intl's formatter prints UTC).
 */
export function formatWhen(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** "3 min ago", "yesterday" — for the activity list. */
export function formatAgo(iso: string, locale: string, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const table: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60]
  ];
  try {
    const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    for (const [unit, size] of table) {
      if (Math.abs(seconds) >= size) {
        return format.format(Math.round(seconds / size), unit);
      }
    }
    return format.format(0, 'minute');
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** Only a path inside the dashboard may be returned to. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith('/dashboard') && !value.startsWith('//')
    ? value
    : null;
}
