'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { NumberPerformance } from '../types/my-day';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * How one of the workspace's own numbers has been answered lately. Only a
 * purchased number has a record here: the public line and a carrier's
 * numbers do not, and get `null`.
 */
export function useNumberPerformance(numberId: string | null | undefined) {
  const api = useApi();
  const [snapshot, setSnapshot] = useState<{
    numberId: string;
    performance: NumberPerformance | null;
  } | null>(null);

  const trackable = !!numberId && UUID.test(numberId);

  useEffect(() => {
    if (!trackable || !numberId) return;
    let cancelled = false;
    api
      .get<NumberPerformance>(
        `/caller-id-rotation/numbers/${numberId}/performance`
      )
      .then((performance) => {
        if (!cancelled) setSnapshot({ numberId, performance });
      })
      .catch(() => {
        if (!cancelled) setSnapshot({ numberId, performance: null });
      });
    return () => {
      cancelled = true;
    };
  }, [api, numberId, trackable]);

  if (!trackable) return { performance: null, loading: false };
  if (snapshot?.numberId !== numberId) {
    return { performance: null, loading: true };
  }
  return { performance: snapshot.performance, loading: false };
}
