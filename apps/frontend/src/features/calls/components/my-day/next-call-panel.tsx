'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CheckCircle2,
  Gift,
  Loader2,
  Phone,
  RotateCw,
  SkipForward
} from 'lucide-react';
import { IconListDetails } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
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
  /** Their lists are still loading: no list yet is not known yet. */
  listsLoading: boolean;
  onChooseList: () => void;
  /** With no list of their own: set one up, through the onboarding. */
  onStart: () => void;
  /** USD finishing the onboarding adds; zero says nothing about credit. */
  reward: number;
  /**
   * Take the focus — on "Call next" when there is somebody to call — and
   * glow for a moment: the onboarding just handed over a list.
   */
  spotlight: boolean;
  onSpotlightDone: () => void;
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
  listsLoading,
  onChooseList,
  onStart,
  reward,
  spotlight,
  onSpotlightDone,
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
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const callRef = useRef<HTMLButtonElement>(null);
  const [glow, setGlow] = useState(false);

  const settling = loading || (!next && (picked?.loading || listsLoading));
  const nextKey = next?.item.key ?? null;

  // Once the panel shows where the onboarding left off — after the dialog
  // has faded — the focus lands on the call, so Enter or N places it.
  useEffect(() => {
    if (!spotlight || settling) return;
    const timer = window.setTimeout(() => {
      const target = callRef.current ?? panelRef.current;
      target?.scrollIntoView({
        block: 'nearest',
        behavior: reduceMotion ? 'auto' : 'smooth'
      });
      target?.focus({ preventScroll: true });
      setGlow(true);
      onSpotlightDone();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [spotlight, settling, nextKey, onSpotlightDone, reduceMotion]);

  useEffect(() => {
    if (!glow) return;
    const timer = window.setTimeout(() => setGlow(false), 2600);
    return () => window.clearTimeout(timer);
  }, [glow]);

  if (settling) {
    return <Skeleton className='h-[92px] w-full rounded-xl' />;
  }

  if (!next && !picked && !hasLists) {
    return <StartCalling reward={reward} onStart={onStart} />;
  }

  if (!next) {
    return (
      <NothingToCall
        ref={panelRef}
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
    <motion.section
      ref={panelRef}
      tabIndex={-1}
      aria-label={t('label')}
      animate={
        glow && !reduceMotion
          ? {
              boxShadow: [
                '0 0 0 0px rgba(16, 185, 129, 0.45)',
                '0 0 0 12px rgba(16, 185, 129, 0)'
              ]
            }
          : { boxShadow: '0 0 0 0px rgba(16, 185, 129, 0)' }
      }
      transition={{ duration: 1.1, ease: 'easeOut', repeat: glow ? 1 : 0 }}
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 transition-[border-color] duration-700 outline-none sm:flex-row sm:items-center sm:px-5 dark:border-emerald-500/25 dark:bg-emerald-500/[0.08]',
        glow && 'border-emerald-500 dark:border-emerald-400/70'
      )}
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
          ref={callRef}
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
    </motion.section>
  );
}

/**
 * Nobody to call and no list of their own: the way in. It opens the
 * onboarding that makes a list in a minute and comes back to this panel.
 */
function StartCalling({
  reward,
  onStart
}: Pick<NextCallPanelProps, 'reward' | 'onStart'>) {
  const t = useTranslations('calls.myDay.next.start');
  const tNext = useTranslations('calls.myDay.next');
  return (
    <section
      aria-label={tNext('label')}
      className='flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 sm:flex-row sm:items-center sm:px-5 dark:border-emerald-500/25 dark:bg-emerald-500/[0.08]'
    >
      <div className='flex min-w-0 flex-1 items-center gap-4'>
        <span className='flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs dark:bg-emerald-500'>
          <Phone className='size-5' />
        </span>
        <div className='min-w-0 flex-1 space-y-1'>
          <p className='text-xs font-semibold tracking-wider text-emerald-800 uppercase dark:text-emerald-300'>
            {tNext('label')}
          </p>
          <p className='text-[17px] leading-tight font-semibold'>
            {t('title')}
          </p>
          <p className='text-muted-foreground text-[13px]'>{t('hint')}</p>
        </div>
      </div>

      <div className='flex shrink-0 flex-col gap-1.5 sm:items-end'>
        <Button
          onClick={onStart}
          aria-keyshortcuts='N'
          className='h-11 gap-2.5 bg-emerald-600 px-5 text-[15px] font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
        >
          <Phone />
          {t('cta')}
          <Kbd onColor className='hidden sm:inline-flex'>
            N
          </Kbd>
        </Button>
        {reward > 0 ? (
          <p className='inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 sm:justify-end dark:text-emerald-300'>
            <Gift className='size-3.5 shrink-0' />
            {t('reward', {
              amount: `$${reward.toFixed(2)}`
            })}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Nobody to call now: what comes due next, how the picked list stands, and
 * the way to keep calling — a list of the user's own.
 */
function NothingToCall({
  ref,
  upcoming,
  picked,
  hasLists,
  onChooseList,
  now
}: Pick<
  NextCallPanelProps,
  'upcoming' | 'picked' | 'hasLists' | 'onChooseList' | 'now'
> & { ref?: React.Ref<HTMLElement> }) {
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
      ref={ref}
      tabIndex={-1}
      aria-label={t('label')}
      className='bg-card flex flex-col gap-3 rounded-xl border px-4 py-4 outline-none sm:flex-row sm:items-center sm:gap-4 sm:px-5'
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
