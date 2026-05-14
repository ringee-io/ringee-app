'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { CallbackEntry } from '../components/dialer-side-panel/shared';

const POLL_INTERVAL_MS = 60_000;
const ACTIVE_STATUSES = new Set(['scheduled', 'due']);

export function useDialerCallbacks() {
  const api = useApi();
  const [callbacks, setCallbacks] = useState<CallbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ data: CallbackEntry[] }>(
        '/callbacks?mine=true&limit=50'
      );
      if (!mountedRef.current) return;
      const active = (data.data || [])
        .filter((cb) => ACTIVE_STATUSES.has(cb.status))
        .sort(
          (a, b) =>
            new Date(a.scheduledAt).getTime() -
            new Date(b.scheduledAt).getTime()
        );
      setCallbacks(active);
    } catch {
      // best-effort
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  return { callbacks, loading, refresh };
}
