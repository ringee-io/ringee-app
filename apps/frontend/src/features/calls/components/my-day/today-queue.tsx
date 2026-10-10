'use client';

import { useTranslations } from 'next-intl';
import { CalendarCheck, RotateCw } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import type { MyDayGroup, MyDayQueueItem } from '../../types/my-day';
import { QueueRow } from './queue-row';

const GROUPS: MyDayGroup[] = ['now', 'later', 'anytime'];

interface TodayQueueProps {
  items: MyDayQueueItem[];
  incoming: MyDayQueueItem[];
  loading: boolean;
  failed: boolean;
  now: Date;
  nextKey: string | null;
  dialingKey: string | null;
  busy: boolean;
  /** The list "Call next" goes through once nobody here is due. */
  pickedList: { id: string; name: string | null } | null;
  onCall: (item: MyDayQueueItem) => void;
  onCancelCallback: (callbackId: string) => void;
  onAcceptIncoming: () => void;
  onRetry: () => void;
}

/** Everyone to call today, by when: now, later today, any time today. */
export function TodayQueue({
  items,
  incoming,
  loading,
  failed,
  now,
  nextKey,
  dialingKey,
  busy,
  pickedList,
  onCall,
  onCancelCallback,
  onAcceptIncoming,
  onRetry
}: TodayQueueProps) {
  const t = useTranslations('calls.myDay.queue');

  return (
    <section
      aria-labelledby='my-day-queue-title'
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3 sm:px-5'>
        <h2 id='my-day-queue-title' className='text-base font-semibold'>
          {t('title')}
        </h2>
        {items.length > 0 ? (
          <p className='text-muted-foreground text-[13px]'>
            {t('count', { count: items.length })} · {t('stableHint')}
          </p>
        ) : null}
      </header>

      {loading ? (
        <div className='space-y-2 border-t px-4 py-3 sm:px-5'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full' />
          ))}
        </div>
      ) : failed ? (
        <div className='flex flex-col items-center gap-3 border-t px-4 py-10 text-center'>
          <p className='text-sm font-medium'>{t('failedTitle')}</p>
          <Button variant='outline' size='sm' onClick={onRetry}>
            <RotateCw />
            {t('retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className='flex flex-col items-center border-t px-4 py-10 text-center'>
          <CalendarCheck className='text-muted-foreground mb-3 size-9' />
          <p className='text-sm font-semibold'>{t('emptyTitle')}</p>
          <p className='text-muted-foreground mt-1 max-w-sm text-[13px]'>
            {pickedList?.name
              ? t('emptyWithList', { list: pickedList.name })
              : t('emptyDescription')}
          </p>
        </div>
      ) : (
        GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} role='group' aria-labelledby={`my-day-${group}`}>
              <h3
                id={`my-day-${group}`}
                className='text-muted-foreground border-t px-4 pt-3 pb-2 text-xs font-semibold tracking-wider uppercase sm:px-5'
              >
                {t(`groups.${group}`)} · {groupItems.length}
              </h3>
              <ul>
                {groupItems.map((item) => (
                  <QueueRow
                    key={item.key}
                    item={item}
                    now={now}
                    isNext={item.key === nextKey}
                    dialing={item.key === dialingKey}
                    busy={busy}
                    preferredListId={pickedList?.id ?? null}
                    onCall={onCall}
                    onCancelCallback={onCancelCallback}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}

      {incoming.length > 0 ? (
        <div
          role='status'
          className='bg-muted/50 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-4 py-2 text-[13px] sm:px-5'
        >
          <span className='flex items-center gap-2'>
            <span className='size-2 rounded-full bg-blue-600 dark:bg-blue-400' />
            {t('incoming', { count: incoming.length })}
          </span>
          <Button
            variant='ghost'
            size='sm'
            className='font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200'
            onClick={onAcceptIncoming}
          >
            {t('addIncoming')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
