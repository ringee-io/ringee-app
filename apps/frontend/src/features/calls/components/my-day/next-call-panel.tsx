'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Phone } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { getInitials } from '../../lib/initials';
import type { MyDayQueueItem } from '../../types/my-day';
import { Kbd } from './kbd';
import { QueueItemPlace, useQueueItemName } from './queue-row';
import { callbackNote, ReasonChips } from './reason-chips';
import { useMyDayFormat } from './use-my-day-format';

interface NextCallPanelProps {
  /** The first person in the queue who can be called now. */
  item: MyDayQueueItem | null;
  /** With nobody due, who comes due next today. */
  upcoming: MyDayQueueItem | null;
  loading: boolean;
  now: Date;
  /** The caller ID the call will go out from, as the user chose it. */
  fromLabel: string | null;
  dialing: boolean;
  busy: boolean;
  onCall: (item: MyDayQueueItem) => void;
}

/** The one primary action of the page: call the next person, with N. */
export function NextCallPanel({
  item,
  upcoming,
  loading,
  now,
  fromLabel,
  dialing,
  busy,
  onCall
}: NextCallPanelProps) {
  const t = useTranslations('calls.myDay.next');
  const fmt = useMyDayFormat();
  const nameOf = useQueueItemName();

  if (loading) {
    return <Skeleton className='h-[92px] w-full rounded-xl' />;
  }

  if (!item) {
    const upcomingAt = upcoming?.dueAt ? new Date(upcoming.dueAt) : null;
    return (
      <section
        aria-label={t('label')}
        className='bg-card flex items-center gap-4 rounded-xl border px-4 py-4 sm:px-5'
      >
        <CheckCircle2 className='size-6 shrink-0 text-emerald-600 dark:text-emerald-400' />
        <div className='min-w-0'>
          <p className='font-semibold'>
            {upcoming && upcomingAt ? t('nothingDue') : t('caughtUp')}
          </p>
          <p className='text-muted-foreground text-[13px]'>
            {upcoming && upcomingAt
              ? t('nothingDueHint', {
                  name: nameOf(upcoming),
                  time: fmt.time(upcomingAt, now)
                })
              : t('caughtUpHint')}
          </p>
        </div>
      </section>
    );
  }

  const name = nameOf(item);
  const note = callbackNote(item.reasons);

  return (
    <section
      aria-label={t('label')}
      className='flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 sm:flex-row sm:items-center sm:px-5 dark:border-emerald-500/25 dark:bg-emerald-500/[0.08]'
    >
      <div className='flex min-w-0 flex-1 items-center gap-4'>
        <span className='bg-background flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold shadow-xs'>
          {getInitials(item.contact.name, item.contact.phoneNumber)}
        </span>
        <div className='min-w-0 flex-1 space-y-1'>
          <p className='text-xs font-semibold tracking-wider text-emerald-800 uppercase dark:text-emerald-300'>
            {t('label')}
          </p>
          <p className='truncate text-[17px] leading-tight font-semibold'>
            {name}
            {item.contact.company ? (
              <span className='text-muted-foreground font-normal'>
                {' '}
                · {item.contact.company}
              </span>
            ) : null}
          </p>
          <div className='text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]'>
            <ReasonChips reasons={item.reasons} now={now} />
            {note ? (
              <span className='max-w-[18rem] truncate italic'>“{note}”</span>
            ) : null}
            <span className='font-mono tabular-nums'>
              {fmt.phone(item.contact.phoneNumber)}
            </span>
            <QueueItemPlace item={item} now={now} />
            {fromLabel ? <span>{fromLabel}</span> : null}
          </div>
        </div>
      </div>

      <Button
        onClick={() => onCall(item)}
        disabled={busy}
        aria-keyshortcuts='N'
        title={busy && !dialing ? t('onCall') : undefined}
        className='h-11 shrink-0 gap-2.5 bg-emerald-600 px-5 text-[15px] font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
      >
        {dialing ? <Loader2 className='animate-spin' /> : <Phone />}
        {dialing ? t('calling') : t('callNext')}
        <Kbd onColor className='hidden sm:inline-flex'>
          N
        </Kbd>
      </Button>
    </section>
  );
}
