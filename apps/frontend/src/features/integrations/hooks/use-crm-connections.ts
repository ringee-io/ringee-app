'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { CrmCallSyncRow, CrmConnectionSummary } from '../types/crm';

export function useCrmConnections() {
  const api = useApi();
  const [connections, setConnections] = useState<CrmConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CrmConnectionSummary[]>('/crm/connections');
      setConnections(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  return { connections, loading, error, reload: load };
}

export function useConnectionSyncs(connectionId: string | null) {
  const api = useApi();
  const [syncs, setSyncs] = useState<CrmCallSyncRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!connectionId) {
      setSyncs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<CrmCallSyncRow[]>(
        `/crm/connections/${connectionId}/syncs`,
        { limit: 50 },
      );
      setSyncs(res);
    } catch {
      setSyncs([]);
    } finally {
      setLoading(false);
    }
  }, [api, connectionId]);

  useEffect(() => {
    load();
  }, [load]);

  return { syncs, loading, reload: load };
}
