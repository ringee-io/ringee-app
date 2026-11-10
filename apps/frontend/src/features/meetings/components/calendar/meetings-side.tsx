'use client';

import { useTranslations } from 'next-intl';
import { addDays, isSameDay } from 'date-fns';
import { CalendarDays, Check, TriangleAlert } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { contactName, meetingStart, useCalendarFormat } from './calendar-utils';
import type { CalendarMeeting, RingeeCalendar } from './types';

/** The next six on the calendars in view, by day. */
export function UpcomingCard({
  meetings,
  now,
  providerOf,
  onSelect
}: {
  meetings: CalendarMeeting[];
  now: Date;
  providerOf: (m: CalendarMeeting) => string | null;
  onSelect: (m: CalendarMeeting) => void;
}) {
  const t = useTranslations('meetings.page.side');
  const fmt = useCalendarFormat();
  const tomorrow = addDays(now, 1);
  let lastGroup = '';

  return (
    <section
      aria-labelledby='mt-upcoming'
      className='bg-card grid gap-2.5 rounded-xl border px-4 py-3.5'
    >
      <div className='flex items-baseline justify-between gap-2.5'>
        <h2 id='mt-upcoming' className='text-[16px] font-semibold'>
          {t('upcoming')}
        </h2>
        <span className='text-muted-foreground text-xs'>
          {t('booked', { count: meetings.length })}
        </span>
      </div>
      {meetings.length === 0 ? (
        <p className='text-muted-foreground text-[12.8px] leading-normal'>
          {t('noneUpcoming')}
        </p>
      ) : (
        <div className='grid gap-0.5'>
          {meetings.slice(0, 6).map((m) => {
            const start = meetingStart(m);
            const group = isSameDay(start, now)
              ? t('today')
              : isSameDay(start, tomorrow)
                ? t('tomorrow')
                : fmt.shortDay(start);
            const header = group !== lastGroup ? group : null;
            lastGroup = group;
            return (
              <div key={m.id} className='grid'>
                {header ? (
                  <p className='text-muted-foreground pt-1 text-xs font-semibold tracking-[0.06em] uppercase'>
                    {header}
                  </p>
                ) : null}
                <button
                  type='button'
                  onClick={() => onSelect(m)}
                  className='hover:bg-muted focus-visible:ring-ring/50 -mx-2 flex w-[calc(100%+1rem)] items-start gap-2.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-[3px]'
                >
                  <span className='text-muted-foreground w-[62px] shrink-0 pt-px text-[12.8px] whitespace-nowrap tabular-nums'>
                    {fmt.time(start)}
                  </span>
                  <span className='grid min-w-0 flex-1 leading-[1.35]'>
                    <b className='truncate font-semibold'>{contactName(m)}</b>
                    <span className='text-muted-foreground truncate text-xs'>
                      {[m.title, t('minutes', { count: m.duration })]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {m.externalSyncStatus === 'failed' ? (
                    <TriangleAlert
                      className='mt-[3px] size-[13px] shrink-0 text-amber-500'
                      aria-label={t('notInProvider', {
                        provider: providerOf(m) ?? ''
                      })}
                    />
                  ) : m.attendanceStatus === 'confirmed' ? (
                    <Check
                      className='mt-[3px] size-[13px] shrink-0 text-emerald-500'
                      aria-label={t('confirmed')}
                    />
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The workspace's calendars, where each one is copied, which are hidden by
 * the filter, and a warning when a meeting did not reach its calendar.
 */
export function CalendarsCard({
  calendars,
  hidden,
  failedCopies,
  providerOf,
  onReview,
  onManage
}: {
  calendars: RingeeCalendar[];
  hidden: Set<string>;
  /** Upcoming meetings whose external copy failed. */
  failedCopies: CalendarMeeting[];
  providerOf: (m: CalendarMeeting) => string | null;
  onReview: (m: CalendarMeeting) => void;
  onManage: () => void;
}) {
  const t = useTranslations('meetings.page.side');
  const tProvider = useTranslations('meetings.page.providers');
  const connected = calendars.filter((calendar) => calendar.integration).length;
  const first = failedCopies[0];

  return (
    <section
      aria-labelledby='mt-calendars'
      className='bg-card grid gap-2.5 rounded-xl border px-4 py-3.5'
    >
      <div className='flex items-center justify-between gap-2.5'>
        <h2 id='mt-calendars' className='text-[16px] font-semibold'>
          {t('calendars')}
        </h2>
        {connected > 0 ? (
          <span className='inline-flex h-[22px] items-center rounded-full bg-emerald-100 px-2.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'>
            {t('connected', { count: connected })}
          </span>
        ) : null}
      </div>
      <div className='grid gap-2'>
        {calendars.map((calendar) => (
          <div key={calendar.id} className='flex min-w-0 items-center gap-2.5'>
            <span className='bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-lg'>
              <CalendarDays className='size-3.5' />
            </span>
            <div className='grid min-w-0 flex-1 leading-[1.35]'>
              <b className='truncate font-semibold'>{calendar.name}</b>
              <span className='text-muted-foreground truncate text-xs'>
                {calendar.integration
                  ? [
                      tProvider(calendar.integration.provider),
                      calendar.integration.email
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : t('onlyRingee')}
              </span>
            </div>
            {hidden.has(calendar.id) ? (
              <span className='text-muted-foreground shrink-0 text-xs'>
                {t('hidden')}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <p className='text-muted-foreground text-[12.8px] leading-normal'>
        {t('calendarsHint')}
      </p>
      {first ? (
        <button
          type='button'
          onClick={() => onReview(first)}
          className='flex w-full items-center gap-[7px] rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-[7px] text-left text-[12.8px]'
        >
          <TriangleAlert className='size-3.5 shrink-0 text-amber-500' />
          <span className='min-w-0 flex-1'>
            {failedCopies.length === 1
              ? t('oneFailed', { provider: providerOf(first) ?? '' })
              : t('manyFailed', { count: failedCopies.length })}
          </span>
          <span className='shrink-0 font-medium text-amber-600 dark:text-amber-400'>
            {t('review')}
          </span>
        </button>
      ) : null}
      <Button
        type='button'
        variant='outline'
        size='sm'
        className='justify-self-start'
        onClick={onManage}
      >
        {t('manage')}
      </Button>
    </section>
  );
}
