'use client';

import { useTranslations } from 'next-intl';
import { Video } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import type { MyDaySummary } from '../../types/my-day';
import { useMyDayFormat } from './use-my-day-format';

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** How the user's own day is going, and the next meeting on it. */
export function TodayCard({
  summary,
  failed,
  now
}: {
  summary: MyDaySummary | null;
  failed: boolean;
  now: Date;
}) {
  const t = useTranslations('calls.myDay.today');
  const fmt = useMyDayFormat();
  const meeting = summary?.nextMeeting ?? null;
  const joinUrl =
    meeting?.location && isUrl(meeting.location) ? meeting.location : null;

  const stats = summary
    ? [
        { value: summary.calls, label: t('calls', { count: summary.calls }) },
        {
          value: summary.conversations,
          label: t('conversations', { count: summary.conversations })
        },
        {
          value: summary.meetingsBooked,
          label: t('meetingsBooked', { count: summary.meetingsBooked })
        }
      ]
    : null;

  return (
    <section
      aria-labelledby='my-day-today-title'
      className='bg-card space-y-3 rounded-xl border p-4 sm:p-5'
    >
      <h2 id='my-day-today-title' className='text-base font-semibold'>
        {t('title')}
      </h2>

      {failed ? (
        <p className='text-muted-foreground text-sm'>{t('failed')}</p>
      ) : !stats ? (
        <Skeleton className='h-[68px] w-full' />
      ) : (
        <>
          <dl className='grid grid-cols-3 gap-2'>
            {stats.map((stat) => (
              <div
                key={stat.label}
                className='bg-muted/60 flex flex-col-reverse gap-0.5 rounded-lg p-2.5'
              >
                <dt className='text-muted-foreground text-xs leading-tight'>
                  {stat.label}
                </dt>
                <dd className='text-[22px] leading-none font-bold tabular-nums'>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className='text-muted-foreground text-xs'>{t('statsHint')}</p>
        </>
      )}

      {summary ? (
        <div className='flex items-center gap-3 border-t pt-3'>
          <div className='min-w-0 flex-1'>
            <p className='text-muted-foreground text-[12.5px]'>
              {t('nextMeeting')}
            </p>
            {meeting ? (
              <>
                <p className='truncate font-semibold'>
                  {meeting.title ||
                    t('meetingWith', {
                      name:
                        meeting.contact?.name ||
                        fmt.phone(meeting.contact?.phoneNumber ?? '')
                    })}
                </p>
                <p className='text-muted-foreground text-[12.5px]'>
                  {t('duration', {
                    time: fmt.time(new Date(meeting.scheduledAt), now),
                    minutes: meeting.duration
                  })}
                </p>
              </>
            ) : (
              <p className='text-sm'>{t('noMeeting')}</p>
            )}
          </div>
          {joinUrl ? (
            <Button asChild variant='outline' size='sm' className='shrink-0'>
              <a href={joinUrl} target='_blank' rel='noopener noreferrer'>
                <Video />
                {t('join')}
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
