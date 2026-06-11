'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  CrmCallSyncRow,
  CrmConnectionSummary,
  CrmFieldMapping,
  CrmListRef,
  CrmOwnerRef
} from '../types/crm';

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
      setError(
        err instanceof Error ? err.message : 'Failed to load connections'
      );
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
        { limit: 50 }
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

export function useFieldMappings(connectionId: string | null) {
  const api = useApi();
  const [mappings, setMappings] = useState<CrmFieldMapping[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!connectionId) {
      setMappings([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<CrmFieldMapping[]>(
        `/crm/connections/${connectionId}/field-mappings`
      );
      setMappings(res);
    } catch {
      setMappings([]);
    } finally {
      setLoading(false);
    }
  }, [api, connectionId]);

  useEffect(() => {
    load();
  }, [load]);

  return { mappings, loading, reload: load };
}

export function useCrmLists(connectionId: string | null) {
  const api = useApi();
  const [lists, setLists] = useState<CrmListRef[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!connectionId) {
      setLists([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<CrmListRef[]>(
        `/crm/connections/${connectionId}/lists`
      );
      setLists(res);
    } catch {
      setLists([]);
    } finally {
      setLoading(false);
    }
  }, [api, connectionId]);

  useEffect(() => {
    load();
  }, [load]);

  return { lists, loading, reload: load };
}

export function useCrmMembers(connectionId: string | null) {
  const api = useApi();
  const [members, setMembers] = useState<CrmOwnerRef[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!connectionId) {
      setMembers([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<CrmOwnerRef[]>(
        `/crm/connections/${connectionId}/members`
      );
      setMembers(res);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [api, connectionId]);

  useEffect(() => {
    load();
  }, [load]);

  return { members, loading, reload: load };
}
