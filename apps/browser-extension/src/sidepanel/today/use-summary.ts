import { useCallback, useRef, useState } from "react";
import type { RingeeApi, TodaySummary } from "../../lib/ringee-api";
import { localDay } from "../../lib/today-queue";
import { useLiveRefresh } from "./use-live-refresh";

const POLL_MS = 120_000;

/** The user's own day so far — counted between the bounds of their local day. */
export function useSummary(api: RingeeApi) {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const res = await api.getSummary(localDay());
      if (request !== requestRef.current) return;
      setSummary(res);
      setFailed(false);
    } catch {
      if (request === requestRef.current) setFailed(true);
    }
  }, [api]);

  useLiveRefresh(refresh, POLL_MS);

  return { summary, failed: failed && summary === null, refresh };
}
