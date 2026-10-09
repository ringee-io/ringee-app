'use client';

import { useMemo } from 'react';
import { useFormatter, useLocale } from 'next-intl';
import { formatForDisplay } from '@ringee/dialer-core/phone';

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Times, numbers and places, the way the queue and its panels show them.
 * Times are the user's local ones: next-intl is configured for UTC (the
 * server cannot know the zone), so these format with `Intl` directly, and
 * only on the client, where the data is loaded.
 */
export function useMyDayFormat() {
  const format = useFormatter();
  const locale = useLocale();

  return useMemo(() => {
    let regions: Intl.DisplayNames | null = null;
    try {
      regions = new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      regions = null;
    }

    return {
      /** "10:30 AM" today; "Oct 6, 10:30 AM" any other day. */
      time(date: Date, now: Date): string {
        return new Intl.DateTimeFormat(
          locale,
          sameDay(date, now)
            ? { hour: 'numeric', minute: '2-digit' }
            : {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              }
        ).format(date);
      },
      /** "Oct 6". */
      day(date: Date): string {
        return new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric'
        }).format(date);
      },
      /** "Thursday, October 8 · 4:24 PM". */
      today(now: Date): string {
        const day = new Intl.DateTimeFormat(locale, {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        }).format(now);
        const time = new Intl.DateTimeFormat(locale, {
          hour: 'numeric',
          minute: '2-digit'
        }).format(now);
        return `${day} · ${time}`;
      },
      /** "12 minutes ago". */
      ago(date: Date, now: Date): string {
        return format.relativeTime(date, now);
      },
      /** The time where the person is, only when their zone is known. */
      localTime(timezone: string | null, now: Date): string | null {
        if (!timezone) return null;
        try {
          return new Intl.DateTimeFormat(locale, {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone
          }).format(now);
        } catch {
          return null;
        }
      },
      country(code: string | null): string | null {
        if (!code) return null;
        try {
          return regions?.of(code) ?? code;
        } catch {
          return code;
        }
      },
      phone(phoneNumber: string): string {
        return formatForDisplay(phoneNumber);
      }
    };
  }, [format, locale]);
}
