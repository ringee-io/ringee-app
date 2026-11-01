'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import type { MyDayQueueItem } from '../types/my-day';
import { useDial } from './use.dial';

/** How long a failed completion waits to try again; the last wait repeats. */
const COMPLETE_RETRY_MS = [1_000, 3_000, 10_000, 30_000];

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls someone from today's queue, through `useDial` like every manual call.
 * A callback is done once it is called — the same rule the callbacks list
 * always had. A dial refused at the DNC prompt, a busy line or a missing
 * caller ID leaves it owed; and since the call is already up when it is
 * marked, marking cannot delay the call and a failure to mark cannot undo it.
 * Missed calls and follow-ups need no write: once the number has been called,
 * the server leaves them out of the queue.
 *
 * `called` holds the callbacks called from here. They stay out of the queue
 * while the server is told — and, should telling it fail, until it hears — so
 * "Call next" never offers the person just called.
 */
export function useQueueDial(onPlaced: () => void) {
  const api = useApi();
  const { dial, busy } = useDial();
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
          await api.patch(`/callbacks/${callbackId}/complete`);
          return;
        } catch (err) {
          // Turned down rather than lost — the callback is gone, or no longer
          // theirs: the queue shows again what the server holds. A request
          // that never got an answer reads as a 500 and is tried again.
          if (err instanceof ApiError && err.status < 500) {
            setCalled((prev) => {
              const next = new Set(prev);
              next.delete(callbackId);
              return next;
            });
            return;
          }
          console.warn('Failed to mark callback completed', err);
          await wait(
            COMPLETE_RETRY_MS[Math.min(attempt, COMPLETE_RETRY_MS.length - 1)]
          );
        }
      }
    },
    [api]
  );

  const callItem = useCallback(
    async (item: MyDayQueueItem): Promise<boolean> => {
      if (busy || dialingKey) return false;
      setDialingKey(item.key);
      try {
        const placed = await dial(item.contact.phoneNumber);
        if (placed) {
          const ids = item.reasons.flatMap((reason) =>
            reason.kind === 'callback' ? [reason.callbackId] : []
          );
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
    [busy, complete, dial, dialingKey, onPlaced]
  );

  return { callItem, dialingKey, busy, called };
}
