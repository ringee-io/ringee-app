'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { MyDaySummary } from '../types/my-day';

const POLL_MS = 120_000;

/** The user's own day so far — counted between the bounds of their local day. */
export function useMyDaySummary() {
  const api = useApi();
  const [summary, setSummary] = useState<MyDaySummary | null>(null);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    try {
      const res = await api.get<MyDaySummary>(
        `/my-day/summary?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`
      );
      if (request !== requestRef.current) return;
      setSummary(res);
      setFailed(false);
    } catch {
      if (request === requestRef.current) setFailed(true);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { summary, failed: failed && summary === null, refresh };
}
