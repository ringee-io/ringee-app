'use client';

import { useTranslations } from 'next-intl';
import { PhoneIncoming, PhoneOutgoing, RotateCw } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { MyDayBriefCall, MyDayContactBrief } from '../../types/my-day';
import { useMyDayFormat } from './use-my-day-format';

type Tone = 'success' | 'info' | 'danger' | 'neutral';

const TONES: Record<Tone, string> = {
  success:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  neutral: 'bg-muted text-muted-foreground'
};

/** Connected is green, a follow-up blue, voicemail red, the rest grey. */
const OUTCOME_TONES: Record<string, Tone> = {
  meeting_booked: 'success',
  sale: 'success',
  interested: 'success',
  follow_up: 'info',
  callback_scheduled: 'info',
  voicemail: 'danger',
  wrong_number: 'danger'
};

function duration(seconds: number | null): string {
  if (seconds == null) return '—';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function HistoryRow({ call, now }: { call: MyDayBriefCall; now: Date }) {
  const tOutcomes = useTranslations('calls.detail.outcomes');
  const tStatus = useTranslations('calls.statusValues');
  const fmt = useMyDayFormat();
  const tone: Tone = call.outcome
    ? (OUTCOME_TONES[call.outcome] ?? 'neutral')
    : call.status === 'failed'
      ? 'danger'
      : 'neutral';
  const label = call.outcome
    ? tOutcomes(call.outcome)
    : tStatus.has(call.status)
      ? tStatus(call.status)
      : call.status;
  const Icon = call.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;

  return (
    <li className='flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2 first:border-t-0 sm:flex-nowrap'>
      <Icon className='text-muted-foreground size-4 shrink-0' aria-hidden />
      <span className='w-[8.5rem] shrink-0 text-sm tabular-nums'>
        {fmt.time(new Date(call.at), now)}
      </span>
      <span className='w-[9.5rem] shrink-0'>
        <span
          className={cn(
            'inline-flex h-[22px] max-w-full items-center truncate rounded-full px-2.5 text-xs font-semibold',
            TONES[tone]
          )}
        >
          {label}
        </span>
      </span>
      <span className='text-muted-foreground w-12 shrink-0 font-mono text-[13px] tabular-nums'>
        {duration(call.durationSeconds)}
      </span>
      {call.note ? (
        <span
          className='text-muted-foreground min-w-0 basis-full truncate text-sm sm:flex-1 sm:basis-auto'
          title={call.note}
        >
          {call.note}
        </span>
      ) : null}
    </li>
  );
}

/**
 * Below who the person is: their company in figures and their email, then
 * how the last calls with them went.
 */
export function NextCallDetail({
  brief,
  loading,
  failed,
  onRetry,
  now
}: {
  brief: MyDayContactBrief | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  now: Date;
}) {
  const t = useTranslations('calls.myDay.next.detail');
  const fmt = useMyDayFormat();

  if (!brief) {
    if (failed) {
      return (
        <div className='text-muted-foreground flex items-center gap-3 text-sm'>
          <span>{t('failed')}</span>
          <Button variant='ghost' size='sm' onClick={onRetry}>
            <RotateCw />
            {t('retry')}
          </Button>
        </div>
      );
    }
    if (loading) {
      return (
        <div className='grid gap-3' aria-busy>
          <Skeleton className='h-[62px] w-full rounded-lg' />
          <Skeleton className='h-24 w-full rounded-lg' />
        </div>
      );
    }
    return null;
  }

  const cells = [
    { key: 'revenue', value: brief.company?.revenue ?? null },
    { key: 'employees', value: brief.company?.employees ?? null },
    { key: 'industry', value: brief.company?.industry ?? null },
    { key: 'email', value: brief.email }
  ].filter((cell): cell is { key: string; value: string } => !!cell.value);

  const last = brief.calls.recent[0];

  return (
    <div className='grid gap-5'>
      {cells.length > 0 ? (
        <dl className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3'>
          {cells.map((cell) => (
            <div
              key={cell.key}
              className={cn(
                'bg-background/80 flex min-w-0 items-baseline justify-between gap-3 rounded-lg px-4 py-2.5 sm:block sm:py-3 dark:bg-black/40',
                cell.key === 'email' && 'sm:flex-1'
              )}
            >
              <dt className='text-muted-foreground shrink-0 text-[13px]'>
                {t(cell.key)}
              </dt>
              <dd
                className='min-w-0 truncate text-[15px] font-semibold sm:mt-1'
                title={cell.value}
              >
                {cell.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <section aria-label={t('history')} className='grid gap-2.5'>
        <p className='flex flex-wrap items-baseline gap-x-2.5'>
          <span className='text-[15px] font-semibold'>{t('history')}</span>
          <span className='text-muted-foreground text-[13px]'>
            {last
              ? t('historySummary', {
                  count: brief.calls.total,
                  day: fmt.day(new Date(last.at))
                })
              : t('noCalls')}
          </span>
        </p>
        {brief.calls.recent.length > 0 ? (
          <ul className='bg-background/80 overflow-hidden rounded-lg dark:bg-black/40'>
            {brief.calls.recent.map((call) => (
              <HistoryRow key={call.id} call={call} now={now} />
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
