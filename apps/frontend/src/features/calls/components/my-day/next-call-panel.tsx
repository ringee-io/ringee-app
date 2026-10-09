'use client';

import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  Loader2,
  Phone,
  RotateCw,
  SkipForward
} from 'lucide-react';
import { IconListDetails } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { getInitials } from '../../lib/initials';
import type {
  MyDayList,
  MyDayListEntry,
  MyDayQueueItem
} from '../../types/my-day';
import { Kbd } from './kbd';
import { ListTag } from './list-tag';
import { QueueItemPlace, useQueueItemName } from './queue-row';
import { callbackNote, ReasonChips } from './reason-chips';
import { useMyDayFormat } from './use-my-day-format';

/** Who "Call next" calls: someone due in today's queue, or the list's next. */
export type NextCall =
  | { source: 'queue'; item: MyDayQueueItem }
  | {
      source: 'list';
      item: MyDayQueueItem;
      entry: MyDayListEntry;
      list: MyDayList;
    };

/** The picked list, when there is one, as far as it is known. */
export interface PickedList {
  list: MyDayList | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}

interface NextCallPanelProps {
  next: NextCall | null;
  /** With nobody due, who comes due next today. */
  upcoming: MyDayQueueItem | null;
  /** Null when no list is picked. */
  picked: PickedList | null;
  /** The user has lists of their own to pick from. */
  hasLists: boolean;
  onChooseList: () => void;
  loading: boolean;
  now: Date;
  /** The caller ID the call will go out from, as the user chose it. */
  fromLabel: string | null;
  dialing: boolean;
  busy: boolean;
  skipping: boolean;
  onCall: (item: MyDayQueueItem) => void;
  onSkip: (entryId: string) => void;
}

/** The one primary action of the page: call the next person, with N. */
export function NextCallPanel({
  next,
  upcoming,
  picked,
  hasLists,
  onChooseList,
  loading,
  now,
  fromLabel,
  dialing,
  busy,
  skipping,
  onCall,
  onSkip
}: NextCallPanelProps) {
  const t = useTranslations('calls.myDay.next');
  const fmt = useMyDayFormat();
  const nameOf = useQueueItemName();

  if (loading || (!next && picked?.loading)) {
    return <Skeleton className='h-[92px] w-full rounded-xl' />;
  }

  if (!next) {
    return (
      <NothingToCall
        upcoming={upcoming}
        picked={picked}
        hasLists={hasLists}
        onChooseList={onChooseList}
        now={now}
      />
    );
  }

  const { item } = next;
  const name = nameOf(item);
  const note = callbackNote(item.reasons);
  const fromList = next.source === 'list' ? next : null;

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
          <div className='flex min-w-0 items-center gap-2.5'>
            <p className='shrink-0 text-xs font-semibold tracking-wider text-emerald-800 uppercase dark:text-emerald-300'>
              {t('label')}
            </p>
            <ListTag
              lists={item.lists}
              preferredId={fromList?.list.id}
              className='text-foreground/70'
            />
          </div>
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
            {fromList ? (
              <>
                {fromList.entry.skipped ? (
                  <span className='bg-muted text-muted-foreground inline-flex h-[22px] items-center rounded-full px-2.5 text-xs font-semibold'>
                    {t('skippedBefore')}
                  </span>
                ) : null}
                <span className='inline-flex h-[22px] items-center rounded-full bg-violet-100 px-2.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'>
                  {t('leftInList', { count: fromList.list.remaining })}
                </span>
              </>
            ) : (
              <ReasonChips reasons={item.reasons} now={now} />
            )}
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

      <div className='flex shrink-0 items-center gap-2'>
        {fromList ? (
          <Button
            variant='ghost'
            onClick={() => onSkip(fromList.entry.entryId)}
            disabled={busy || skipping}
            aria-keyshortcuts='S'
            title={t('skipHint')}
            className='h-11 gap-2 px-3 text-[15px]'
          >
            {skipping ? <Loader2 className='animate-spin' /> : <SkipForward />}
            {t('skip')}
            <Kbd className='hidden sm:inline-flex'>S</Kbd>
          </Button>
        ) : null}
        <Button
          onClick={() => onCall(item)}
          disabled={busy || skipping}
          aria-keyshortcuts='N'
          title={busy && !dialing ? t('onCall') : undefined}
          className='h-11 flex-1 gap-2.5 bg-emerald-600 px-5 text-[15px] font-semibold text-white hover:bg-emerald-700 sm:flex-none dark:bg-emerald-600 dark:hover:bg-emerald-500'
        >
          {dialing ? <Loader2 className='animate-spin' /> : <Phone />}
          {dialing ? t('calling') : t('callNext')}
          <Kbd onColor className='hidden sm:inline-flex'>
            N
          </Kbd>
        </Button>
      </div>
    </section>
  );
}

/**
 * Nobody to call now: what comes due next, how the picked list stands, and
 * the way to keep calling — a list of the user's own.
 */
function NothingToCall({
  upcoming,
  picked,
  hasLists,
  onChooseList,
  now
}: Pick<
  NextCallPanelProps,
  'upcoming' | 'picked' | 'hasLists' | 'onChooseList' | 'now'
>) {
  const t = useTranslations('calls.myDay.next');
  const fmt = useMyDayFormat();
  const nameOf = useQueueItemName();
  const upcomingAt = upcoming?.dueAt ? new Date(upcoming.dueAt) : null;
  const upcomingHint =
    upcoming && upcomingAt
      ? t('nothingDueHint', {
          name: nameOf(upcoming),
          time: fmt.time(upcomingAt, now)
        })
      : null;

  let title: string;
  let hint: string;
  if (picked?.failed) {
    title = t('listFailed');
    hint = t('listFailedHint');
  } else if (picked?.list) {
    title = t('listDone', { list: picked.list.name });
    hint =
      upcomingHint ??
      (picked.list.remaining > 0
        ? t('listBlockedHint', { count: picked.list.remaining })
        : t('listDoneHint'));
  } else if (upcomingHint) {
    title = t('nothingDue');
    hint = upcomingHint;
  } else {
    title = t('caughtUp');
    hint = hasLists ? t('caughtUpWithLists') : t('caughtUpHint');
  }

  return (
    <section
      aria-label={t('label')}
      className='bg-card flex flex-col gap-3 rounded-xl border px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5'
    >
      <div className='flex min-w-0 flex-1 items-center gap-4'>
        <CheckCircle2 className='size-6 shrink-0 text-emerald-600 dark:text-emerald-400' />
        <div className='min-w-0'>
          <p className='font-semibold'>{title}</p>
          <p className='text-muted-foreground text-[13px]'>{hint}</p>
        </div>
      </div>
      {picked?.failed ? (
        <Button
          variant='outline'
          size='sm'
          className='shrink-0 self-start sm:self-center'
          onClick={picked.onRetry}
        >
          <RotateCw />
          {t('retry')}
        </Button>
      ) : hasLists ? (
        <Button
          variant='outline'
          size='sm'
          className='shrink-0 self-start sm:self-center'
          onClick={onChooseList}
        >
          <IconListDetails className='size-4' />
          {picked ? t('changeList') : t('chooseList')}
        </Button>
      ) : null}
    </section>
  );
}
