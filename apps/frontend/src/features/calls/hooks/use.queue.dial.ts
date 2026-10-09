'use client';

import { useCallback, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { MyDayQueueItem } from '../types/my-day';
import { useDial } from './use.dial';

/**
 * Calls someone from today's queue, through `useDial` like every manual call.
 * A callback is done once it is called — the same rule the callbacks list
 * always had. A dial refused at the DNC prompt, a busy line or a missing
 * caller ID leaves it owed; and since the call is already up when it is
 * marked, marking cannot delay the call and a failure to mark cannot undo it.
 * Missed calls and follow-ups need no write: once the number has been called,
 * the server leaves them out of the queue.
 */
export function useQueueDial(onPlaced: () => void) {
  const api = useApi();
  const { dial, busy } = useDial();
  const [dialingKey, setDialingKey] = useState<string | null>(null);

  const callItem = useCallback(
    async (item: MyDayQueueItem): Promise<boolean> => {
      if (busy || dialingKey) return false;
      setDialingKey(item.key);
      try {
        const placed = await dial(item.contact.phoneNumber);
        if (placed) {
          await Promise.all(
            item.reasons.flatMap((reason) =>
              reason.kind === 'callback'
                ? [
                    api
                      .patch(`/callbacks/${reason.callbackId}/complete`)
                      .catch((err) =>
                        console.warn('Failed to mark callback completed', err)
                      )
                  ]
                : []
            )
          );
          onPlaced();
        }
        return placed;
      } finally {
        setDialingKey(null);
      }
    },
    [api, busy, dial, dialingKey, onPlaced]
  );

  return { callItem, dialingKey, busy };
}
