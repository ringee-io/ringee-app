'use client';

import { useTranslations } from 'next-intl';
import { isSameDay } from 'date-fns';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  contactName,
  dateKey,
  isUpcoming,
  meetingStart,
  monthDays,
  useCalendarFormat,
  weekDays
} from './calendar-utils';
import type { CalendarMeeting } from './types';

/** Month: up to three names a day and "+N more"; a day opens its Day view. */
export function MonthGrid({
  anchor,
  now,
  meetings,
  matches,
  onSelect,
  onOpenDay
}: {
  anchor: Date;
  now: Date;
  meetings: CalendarMeeting[];
  matches: (m: CalendarMeeting) => boolean;
  onSelect: (m: CalendarMeeting) => void;
  onOpenDay: (date: Date) => void;
}) {
  const t = useTranslations('meetings.page.grid');
  const fmt = useCalendarFormat();
  const days = monthDays(anchor);

  return (
    <div className='min-w-0'>
      <div className='grid h-11 grid-cols-7 border-b'>
        {weekDays(anchor).map((day) => (
          <span
            key={dateKey(day)}
            className='text-muted-foreground grid place-items-center text-xs tracking-[0.04em] uppercase'
          >
            {fmt.weekday(day)}
          </span>
        ))}
      </div>
      <div className='grid auto-rows-[88px] grid-cols-7'>
        {days.map((day, index) => {
          const list = meetings
            .filter((m) => isSameDay(meetingStart(m), day) && matches(m))
            .sort(
              (a, b) => meetingStart(a).getTime() - meetingStart(b).getTime()
            );
          const outside = day.getMonth() !== anchor.getMonth();
          const today = isSameDay(day, now);
          return (
            <div
              key={dateKey(day)}
              role='button'
              tabIndex={0}
              aria-label={fmt.longDay(day)}
              onClick={() => onOpenDay(day)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenDay(day);
                }
              }}
              className={cn(
                'focus-visible:ring-ring/50 grid min-w-0 cursor-pointer content-start gap-[3px] px-1.5 py-[5px] outline-none focus-visible:ring-[3px] focus-visible:ring-inset',
                index % 7 !== 0 && 'border-l',
                index >= 7 && 'border-t',
                outside && 'bg-muted/35'
              )}
            >
              <span
                className={cn(
                  'grid size-[22px] place-items-center rounded-full text-xs font-semibold',
                  outside && 'text-muted-foreground',
                  today && 'bg-emerald-600 text-white'
                )}
              >
                {day.getDate()}
              </span>
              {list.slice(0, 3).map((m) => {
                const cancelled = m.status === 'cancelled';
                const upcoming = isUpcoming(m, now);
                const start = meetingStart(m);
                return (
                  <button
                    key={m.id}
                    type='button'
                    title={[fmt.time(start), m.title]
                      .filter(Boolean)
                      .join(' · ')}
                    aria-label={[
                      contactName(m),
                      fmt.time(start),
                      cancelled ? t('cancelledLabel') : null
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(m);
                    }}
                    className={cn(
                      'hover:bg-muted flex h-[18px] min-w-0 items-center gap-[5px] overflow-hidden rounded px-[5px] text-left text-xs leading-none whitespace-nowrap',
                      !upcoming && 'text-muted-foreground',
                      cancelled && 'line-through'
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        cancelled
                          ? 'border border-neutral-500'
                          : upcoming
                            ? 'bg-emerald-500'
                            : 'bg-neutral-500'
                      )}
                      aria-hidden
                    />
                    <span className='truncate'>{contactName(m)}</span>
                  </button>
                );
              })}
              {list.length > 3 ? (
                <span className='text-muted-foreground pl-[5px] text-xs'>
                  {t('more', { count: list.length - 3 })}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
