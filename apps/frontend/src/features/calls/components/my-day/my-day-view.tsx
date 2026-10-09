'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNow, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { CountryCode } from '@ringee/dialer-core/phone';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { useRotationEnabled } from '@/features/number-rotation';
import { FirstListDialog } from '@/features/onboarding/components/first-list/first-list-dialog';
import { useFirstListOnboarding } from '@/features/onboarding/hooks/use.first.list.onboarding';
import { useCallFinished } from '../../hooks/use.call.finished';
import { useCallList } from '../../hooks/use.call.list';
import { useCallPageShortcuts } from '../../hooks/use.call.page.shortcuts';
import { useDial } from '../../hooks/use.dial';
import { isCallableNow, useMyDayQueue } from '../../hooks/use.my.day.queue';
import { useMyDaySummary } from '../../hooks/use.my.day.summary';
import { useQueueDial } from '../../hooks/use.queue.dial';
import { useNumbersStore } from '../../store/number.selector.store';
import type {
  MyDayList,
  MyDayListEntry,
  MyDayQueueItem
} from '../../types/my-day';
import { CallSearch, type CallSearchHandle } from './call-search';
import { KeypadButton } from './keypad-button';
import { ListPicker } from './list-picker';
import { NextCallPanel, type NextCall } from './next-call-panel';
import { ShortcutsCard } from './shortcuts-card';
import { TodayCard } from './today-card';
import { TodayQueue } from './today-queue';
import { useMyDayFormat } from './use-my-day-format';
import { YourLineCard } from './your-line-card';

/**
 * Where a number typed without its country code belongs, until the user picks
 * a country on the keypad: the country of the number they call from, else
 * their browser's region.
 */
function useDialRegion(): CountryCode {
  const selected = useNumbersStore((s) => s.selectedNumber);
  const [browserRegion, setBrowserRegion] = useState<CountryCode | null>(null);

  useEffect(() => {
    const region = navigator.language.split('-')[1]?.toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region)) {
      setBrowserRegion(region as CountryCode);
    }
  }, []);

  if (
    selected &&
    selected.id !== 'public' &&
    /^[A-Z]{2}$/.test(selected.isoCountry ?? '')
  ) {
    return selected.isoCountry as CountryCode;
  }
  return browserRegion ?? 'US';
}

/** A list's next contact, in the shape the call surfaces take. */
function listEntryItem(list: MyDayList, entry: MyDayListEntry): MyDayQueueItem {
  return {
    key: `list-entry:${entry.entryId}`,
    group: 'anytime',
    dueAt: null,
    contact: entry.contact,
    doNotCall: false,
    reasons: [],
    lists: [{ id: list.id, name: list.name }]
  };
}

/**
 * "My day": the next call, today's queue, and the line it goes out on. Once
 * nobody in the queue is due, "Call next" goes through the list the user
 * picked. With no list of their own, "Start calling" opens the onboarding
 * that makes one, picks it, and hands the focus back to the next call.
 */
export function MyDayView() {
  const t = useTranslations('calls.myDay');
  const api = useApi();
  const fmt = useMyDayFormat();
  const now = useNow({ updateInterval: 30_000 });
  const searchParams = useSearchParams();
  const queue = useMyDayQueue();
  const summary = useMyDaySummary();
  const dialRegion = useDialRegion();
  const [pickedCountry, setPickedCountry] = useState<CountryCode | null>(null);
  const region = pickedCountry ?? dialRegion;
  const { dial } = useDial();
  const searchRef = useRef<CallSearchHandle>(null);
  const [query, setQuery] = useState('');
  const [keypadOpen, setKeypadOpen] = useState(false);
  const callList = useCallList();
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const firstList = useFirstListOnboarding();
  const [listSetupOpen, setListSetupOpen] = useState(false);
  const [spotlight, setSpotlight] = useState(false);
  const fetchBalance = useCreditStore((s) => s.fetchBalance);

  const refreshQueue = queue.refresh;
  const refreshSummary = summary.refresh;
  const refreshListNext = callList.refreshNext;
  const refreshAll = useCallback(() => {
    void refreshQueue();
    void refreshSummary();
    void refreshListNext();
  }, [refreshQueue, refreshSummary, refreshListNext]);

  const { callItem, dialingKey, busy } = useQueueDial(refreshAll);
  useCallFinished(refreshAll);

  // What is left in each list moves with every call: re-read it on opening.
  const refreshLists = callList.refreshLists;
  useEffect(() => {
    if (listPickerOpen) void refreshLists();
  }, [listPickerOpen, refreshLists]);

  // A link can bring a number to call (`?phoneNumber=14155552671`).
  useEffect(() => {
    const phoneNumber = searchParams.get('phoneNumber')?.trim();
    if (phoneNumber) setQuery(`+${phoneNumber.replace(/^\+/, '')}`);
  }, [searchParams]);

  const dueNow = queue.items.find((item) => isCallableNow(item, now)) ?? null;
  const upcoming = dueNow
    ? null
    : (queue.items.find((item) => item.group === 'later' && !item.doNotCall) ??
      null);
  const listNext = callList.next;
  // Today's queue first; the list only once nobody in it is due.
  const next = useMemo<NextCall | null>(() => {
    if (dueNow) return { source: 'queue', item: dueNow };
    if (!listNext?.next) return null;
    return {
      source: 'list',
      item: listEntryItem(listNext.list, listNext.next),
      entry: listNext.next,
      list: listNext.list
    };
  }, [dueNow, listNext]);

  const dialFromSearch = useCallback(
    async (phoneNumber: string) => {
      const placed = await dial(phoneNumber);
      if (placed) {
        setKeypadOpen(false);
        setQuery('');
        refreshAll();
      }
      return placed;
    },
    [dial, refreshAll]
  );

  const cancelCallback = useCallback(
    async (callbackId: string) => {
      try {
        await api.patch(`/callbacks/${callbackId}/cancel`);
        await refreshQueue();
      } catch {
        toast.error(t('queue.cancelFailed'));
      }
    },
    [api, refreshQueue, t]
  );

  const hasLists = callList.lists.length > 0;
  const startCalling = useCallback(() => {
    setListPickerOpen(false);
    setListSetupOpen(true);
  }, []);

  // The new list goes to work at once, behind the dialog's last step.
  const selectList = callList.select;
  const markFirstListDone = firstList.markCompleted;
  const listReady = useCallback(
    (list: { id: string }, rewardGranted: number) => {
      markFirstListDone();
      selectList(list.id);
      void refreshLists();
      if (rewardGranted > 0) void fetchBalance(api, false, true);
    },
    [api, fetchBalance, markFirstListDone, refreshLists, selectList]
  );
  const endSpotlight = useCallback(() => setSpotlight(false), []);

  const skipListEntry = callList.skip;
  const skip = useCallback(
    (entryId: string) => {
      if (!busy) void skipListEntry(entryId);
    },
    [busy, skipListEntry]
  );

  useCallPageShortcuts({
    onCallNext: () => {
      if (next) {
        if (!callList.skipping) void callItem(next.item);
      } else if (!hasLists && !callList.listsLoading && !queue.loading) {
        startCalling();
      }
    },
    onFocusSearch: () => searchRef.current?.focus(),
    onToggleKeypad: () => setKeypadOpen((open) => !open),
    onToggleListPicker: () => setListPickerOpen((open) => !open),
    onSkip: () => {
      if (next?.source === 'list') skip(next.entry.entryId);
    }
  });

  const selected = useNumbersStore((s) => s.selectedNumber);
  const rotationEnabled = useRotationEnabled();
  const fromLabel =
    rotationEnabled && selected?.source !== 'external_carrier'
      ? t('next.fromAuto')
      : selected?.id === 'public'
        ? selected.phoneNumber
          ? t('next.fromPublic')
          : null
        : selected?.phoneNumber
          ? t('next.from', { number: fmt.phone(selected.phoneNumber) })
          : null;

  return (
    <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_21.5rem]'>
      <div className='flex min-w-0 flex-col gap-4'>
        <div className='flex gap-2'>
          <CallSearch
            ref={searchRef}
            query={query}
            onQueryChange={setQuery}
            region={region}
            onDial={dialFromSearch}
          />
          <KeypadButton
            open={keypadOpen}
            onOpenChange={setKeypadOpen}
            query={query}
            onQueryChange={setQuery}
            country={region}
            onCountryChange={setPickedCountry}
            onDial={dialFromSearch}
          />
          <ListPicker
            open={listPickerOpen}
            onOpenChange={setListPickerOpen}
            lists={callList.lists}
            loading={callList.listsLoading}
            failed={callList.listsFailed}
            onRetry={() => void refreshLists()}
            selectedId={callList.selectedId}
            selected={callList.selected}
            onSelect={callList.select}
            onCreateList={startCalling}
          />
        </div>

        <NextCallPanel
          next={next}
          upcoming={upcoming}
          picked={
            callList.selectedId
              ? {
                  list: callList.selected,
                  loading: callList.nextLoading,
                  failed: callList.nextFailed,
                  onRetry: () => void refreshListNext()
                }
              : null
          }
          hasLists={hasLists}
          listsLoading={callList.listsLoading}
          onChooseList={() => setListPickerOpen(true)}
          onStart={startCalling}
          reward={firstList.reward}
          spotlight={spotlight}
          onSpotlightDone={endSpotlight}
          loading={queue.loading}
          now={now}
          fromLabel={fromLabel}
          dialing={next !== null && dialingKey === next.item.key}
          busy={busy}
          skipping={callList.skipping}
          onCall={(item) => void callItem(item)}
          onSkip={skip}
        />

        <TodayQueue
          items={queue.items}
          incoming={queue.incoming}
          loading={queue.loading}
          failed={queue.failed}
          now={now}
          nextKey={next?.source === 'queue' ? next.item.key : null}
          dialingKey={dialingKey}
          busy={busy}
          pickedList={
            callList.selectedId
              ? {
                  id: callList.selectedId,
                  name: callList.selected?.name ?? null
                }
              : null
          }
          onCall={(item) => void callItem(item)}
          onCancelCallback={(callbackId) => void cancelCallback(callbackId)}
          onAcceptIncoming={queue.acceptIncoming}
          onRetry={() => void refreshQueue()}
        />
      </div>

      <aside className='flex flex-col gap-4' aria-label={t('asideLabel')}>
        <YourLineCard />
        <TodayCard
          summary={summary.summary}
          failed={summary.failed}
          now={now}
        />
        <ShortcutsCard />
      </aside>

      <FirstListDialog
        open={listSetupOpen}
        onOpenChange={setListSetupOpen}
        reward={firstList.reward}
        firstTime={!firstList.completed && !hasLists}
        defaultCountry={region}
        onListReady={listReady}
        onFinish={() => setSpotlight(true)}
      />
    </div>
  );
}
