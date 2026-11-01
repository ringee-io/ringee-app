import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, type QueueItem, type RingeeApi } from "../../lib/ringee-api";
import {
  arrangeQueue,
  keepOrder,
  localDay,
  owedCallbacks,
} from "../../lib/today-queue";
import { useApp } from "../navigation";
import { useLiveRefresh } from "./use-live-refresh";

const POLL_MS = 60_000;

/** How long a failed completion waits to try again; the last wait repeats. */
const COMPLETE_RETRY_MS = [1_000, 3_000, 10_000, 30_000];

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Today's queue, in an order that never changes under the cursor. Everyone
 * from the day's first load is in; anyone who turns up later waits in
 * `incoming` until the user adds them. People who drop out leave at once.
 */
export function useQueue(api: RingeeApi) {
  const [fresh, setFresh] = useState<QueueItem[] | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);
  /** The local day the kept order belongs to (its midnight). */
  const dayRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    const day = localDay();
    try {
      const res = await api.getQueue(day.to);
      if (request !== requestRef.current) return;
      const items = res?.items ?? [];
      // A panel left open overnight: the new day's first load sets the order
      // afresh, or all of today would wait in `incoming`.
      const newDay = dayRef.current !== day.from.getTime();
      dayRef.current = day.from.getTime();
      setFresh(items);
      setFailed(false);
      setOrder((prev) => keepOrder(newDay ? null : prev, items));
    } catch {
      if (request === requestRef.current) setFailed(true);
    }
  }, [api]);

  useLiveRefresh(refresh, POLL_MS);

  const { items, incoming } = useMemo(
    () =>
      fresh && order
        ? arrangeQueue(fresh, order)
        : { items: [] as QueueItem[], incoming: [] as QueueItem[] },
    [fresh, order],
  );

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
    acceptIncoming,
  };
}

/**
 * Calls someone from the queue through the panel's one dial path. A callback
 * is done once it is called (CALL-013): a dial the backend refused — Do Not
 * Call, no credit, no caller ID, a call already live — leaves it owed. Missed
 * calls and follow-ups need no write: once the number has been called, the
 * server leaves them out of the queue.
 *
 * `called` holds the callbacks called from here. They stay out of the queue
 * while the server is told — and, should telling it fail, until it hears — so
 * Call next never offers the person just called.
 */
export function useQueueDial(onPlaced: () => void) {
  const { api, onDial } = useApp();
  const [dialingKey, setDialingKey] = useState<string | null>(null);
  const [called, setCalled] = useState<ReadonlySet<string>>(() => new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Tells the server a callback is done, and keeps at it until it hears. */
  const complete = useCallback(
    async (callbackId: string) => {
      for (let attempt = 0; mounted.current; attempt += 1) {
        try {
          await api.completeCallback(callbackId);
          return;
        } catch (err) {
          // Turned down rather than lost — the callback is gone, or no longer
          // theirs: the queue shows again what the server holds.
          if (err instanceof ApiError && err.status < 500) {
            setCalled((prev) => {
              const next = new Set(prev);
              next.delete(callbackId);
              return next;
            });
            return;
          }
          console.warn("Failed to mark callback completed", err);
          await wait(
            COMPLETE_RETRY_MS[Math.min(attempt, COMPLETE_RETRY_MS.length - 1)],
          );
        }
      }
    },
    [api],
  );

  const callItem = useCallback(
    async (item: QueueItem): Promise<boolean> => {
      if (dialingKey) return false;
      setDialingKey(item.key);
      try {
        const placed = await onDial(
          item.contact.phoneNumber,
          item.contact.name ?? undefined,
        );
        if (placed) {
          const ids = owedCallbacks(item).map((reason) => reason.callbackId);
          if (ids.length > 0) {
            setCalled((prev) => new Set([...prev, ...ids]));
            for (const id of ids) void complete(id);
          }
          onPlaced();
        }
        return placed;
      } finally {
        setDialingKey(null);
      }
    },
    [complete, dialingKey, onDial, onPlaced],
  );

  return { callItem, dialingKey, called };
}
