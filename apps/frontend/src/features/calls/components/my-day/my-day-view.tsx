'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNow, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { CountryCode } from '@ringee/dialer-core/phone';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useRotationEnabled } from '@/features/number-rotation';
import { useCallFinished } from '../../hooks/use.call.finished';
import { useCallPageShortcuts } from '../../hooks/use.call.page.shortcuts';
import { useDial } from '../../hooks/use.dial';
import { isCallableNow, useMyDayQueue } from '../../hooks/use.my.day.queue';
import { useMyDaySummary } from '../../hooks/use.my.day.summary';
import { useQueueDial } from '../../hooks/use.queue.dial';
import { useNumbersStore } from '../../store/number.selector.store';
import { CallSearch, type CallSearchHandle } from './call-search';
import { KeypadButton } from './keypad-button';
import { NextCallPanel } from './next-call-panel';
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

/** "My day": the next call, today's queue, and the line it goes out on. */
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

  const refreshQueue = queue.refresh;
  const refreshSummary = summary.refresh;
  const refreshAll = useCallback(() => {
    void refreshQueue();
    void refreshSummary();
  }, [refreshQueue, refreshSummary]);

  const { callItem, dialingKey, busy } = useQueueDial(refreshAll);
  useCallFinished(refreshAll);

  // A link can bring a number to call (`?phoneNumber=14155552671`).
  useEffect(() => {
    const phoneNumber = searchParams.get('phoneNumber')?.trim();
    if (phoneNumber) setQuery(`+${phoneNumber.replace(/^\+/, '')}`);
  }, [searchParams]);

  const next = queue.items.find((item) => isCallableNow(item, now)) ?? null;
  const upcoming = next
    ? null
    : (queue.items.find((item) => item.group === 'later' && !item.doNotCall) ??
      null);

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

  useCallPageShortcuts({
    onCallNext: () => {
      if (next) void callItem(next);
    },
    onFocusSearch: () => searchRef.current?.focus(),
    onToggleKeypad: () => setKeypadOpen((open) => !open)
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
        </div>

        <NextCallPanel
          item={next}
          upcoming={upcoming}
          loading={queue.loading}
          now={now}
          fromLabel={fromLabel}
          dialing={next !== null && dialingKey === next.key}
          busy={busy}
          onCall={(item) => void callItem(item)}
        />

        <TodayQueue
          items={queue.items}
          incoming={queue.incoming}
          loading={queue.loading}
          failed={queue.failed}
          now={now}
          nextKey={next?.key ?? null}
          dialingKey={dialingKey}
          busy={busy}
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
    </div>
  );
}
