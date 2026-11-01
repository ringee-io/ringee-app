'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  MyDayGroup,
  MyDayQueueItem,
  MyDayQueueResponse
} from '../types/my-day';

const POLL_MS = 60_000;
const GROUPS: MyDayGroup[] = ['now', 'later', 'anytime'];

/** The end of the user's own day: the server cannot know their time zone. */
function endOfLocalDay(): Date {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Today's queue, in an order that never changes under the cursor. Everyone
 * from the first load is in; anyone who turns up later waits in `incoming`
 * until the user adds them, then joins the end of their section. People who
 * drop out — called back, callback completed — leave at once.
 */
export function useMyDayQueue() {
  const api = useApi();
  const [fresh, setFresh] = useState<MyDayQueueItem[] | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);
  /** The local day the kept order belongs to (its last millisecond). */
  const dayRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    const end = endOfLocalDay();
    try {
      const until = encodeURIComponent(end.toISOString());
      const res = await api.get<MyDayQueueResponse>(
        `/my-day/queue?until=${until}`
      );
      if (request !== requestRef.current) return;
      const items = res?.items ?? [];
      const keys = new Set(items.map((item) => item.key));
      // A page left open overnight: the new day's first load sets the order
      // afresh, or all of today would wait in `incoming`.
      const newDay = dayRef.current !== end.getTime();
      dayRef.current = end.getTime();
      setFresh(items);
      setFailed(false);
      // Someone who left and comes back is new again, not slotted back in.
      setOrder((prev) =>
        prev && !newDay
          ? prev.filter((key) => keys.has(key))
          : items.map((item) => item.key)
      );
    } catch {
      if (request === requestRef.current) setFailed(true);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const { items, incoming } = useMemo(() => {
    if (!fresh || !order) {
      return { items: [] as MyDayQueueItem[], incoming: [] };
    }
    const byKey = new Map(fresh.map((item) => [item.key, item]));
    const accepted = new Set(order);
    const kept = order.flatMap((key) => byKey.get(key) ?? []);
    return {
      // Sections follow the time of day; inside one, the order of arrival.
      items: GROUPS.flatMap((group) =>
        kept.filter((item) => item.group === group)
      ),
      incoming: fresh.filter((item) => !accepted.has(item.key))
    };
  }, [fresh, order]);

  const acceptIncoming = useCallback(() => {
    setOrder((prev) => [...(prev ?? []), ...incoming.map((item) => item.key)]);
  }, [incoming]);

  return {
    items,
    incoming,
    loading: fresh === null && !failed,
    /** Only when there is nothing to show; a failed refresh keeps the list. */
    failed: failed && fresh === null,
    refresh,
    acceptIncoming
  };
}

/** Whether the item can be called now: due, and not on the Do Not Call list. */
export function isCallableNow(item: MyDayQueueItem, now: Date): boolean {
  if (item.doNotCall) return false;
  if (item.group !== 'later') return true;
  return !!item.dueAt && new Date(item.dueAt).getTime() <= now.getTime();
}

/**
 * With nobody due, who comes due next today: the soonest, since someone added
 * to the queue later can be due before everyone already in it.
 */
export function upcomingCall(
  items: MyDayQueueItem[],
  now: Date
): MyDayQueueItem | null {
  if (items.some((item) => isCallableNow(item, now))) return null;
  let soonest: { item: MyDayQueueItem; at: number } | null = null;
  for (const item of items) {
    if (item.group !== 'later' || item.doNotCall || !item.dueAt) continue;
    const at = new Date(item.dueAt).getTime();
    if (!soonest || at < soonest.at) soonest = { item, at };
  }
  return soonest?.item ?? null;
}

/**
 * The queue without whoever's callback was just called from it: done
 * (CALL-013), whether or not the server has heard yet.
 */
export function withoutCalled(
  items: MyDayQueueItem[],
  called: ReadonlySet<string>
): MyDayQueueItem[] {
  if (called.size === 0) return items;
  return items.filter(
    (item) =>
      !item.reasons.some(
        (reason) => reason.kind === 'callback' && called.has(reason.callbackId)
      )
  );
}
