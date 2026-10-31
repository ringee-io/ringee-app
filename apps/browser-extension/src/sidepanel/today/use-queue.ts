import { useCallback, useMemo, useRef, useState } from "react";
import type { QueueItem, RingeeApi } from "../../lib/ringee-api";
import {
  arrangeQueue,
  keepOrder,
  localDay,
  owedCallbacks,
} from "../../lib/today-queue";
import { useApp } from "../navigation";
import { useLiveRefresh } from "./use-live-refresh";

const POLL_MS = 60_000;

/**
 * Today's queue, in an order that never changes under the cursor. Everyone
 * from the first load is in; anyone who turns up later waits in `incoming`
 * until the user adds them. People who drop out leave at once.
 */
export function useQueue(api: RingeeApi) {
  const [fresh, setFresh] = useState<QueueItem[] | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const res = await api.getQueue(localDay().to);
      if (request !== requestRef.current) return;
      const items = res?.items ?? [];
      setFresh(items);
      setFailed(false);
      setOrder((prev) => keepOrder(prev, items));
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
 */
export function useQueueDial(onPlaced: () => void) {
  const { api, onDial } = useApp();
  const [dialingKey, setDialingKey] = useState<string | null>(null);

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
          await Promise.all(
            owedCallbacks(item).map((reason) =>
              api
                .completeCallback(reason.callbackId)
                .catch((err) =>
                  console.warn("Failed to mark callback completed", err),
                ),
            ),
          );
          onPlaced();
        }
        return placed;
      } finally {
        setDialingKey(null);
      }
    },
    [api, dialingKey, onDial, onPlaced],
  );

  return { callItem, dialingKey };
}
