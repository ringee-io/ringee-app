'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

/**
 * Live count for the sidebar "Pending Actions" badge. The backend computes the
 * 4.6 predicate (pending, counts toward badge, not snoozed/expired, and urgent
 * or a review action), so the badge stays useful instead of counting everything.
 */
export function usePendingActionsBadge(): number {
  const api = useApi();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api.get<{ count: number }>('/pending-actions/badge');
        if (active) setCount(res?.count ?? 0);
      } catch {
        // best-effort; leave the previous value
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return count;
}
