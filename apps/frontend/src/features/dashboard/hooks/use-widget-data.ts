'use client';

import * as React from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDashboardFilters } from '../lib/filters-context';

export interface WidgetState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch a dashboard endpoint with the current filters. Re-fetches whenever
 * the query changes.
 */
export function useWidgetData<T>(
  endpoint: string,
  extra?: Record<string, string>
): WidgetState<T> {
  const api = useApi();
  const { toQuery } = useDashboardFilters();
  const query = React.useMemo(
    () => ({ ...toQuery(), ...extra }),
    [toQuery, extra]
  );
  const queryKey = JSON.stringify(query);

  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get<T>(endpoint, query)
      .then((res) => {
        if (!active) return;
        setData(res);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, queryKey, tick]);

  return {
    data,
    loading,
    error,
    refetch: () => setTick((t) => t + 1)
  };
}
