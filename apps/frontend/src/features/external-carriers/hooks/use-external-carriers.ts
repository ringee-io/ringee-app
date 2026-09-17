'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useTranslations } from 'next-intl';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import type { ExternalCarrier } from '../types';

/** Mounted with an organization key, so workspace changes discard all state. */
export function useExternalCarriers() {
  const api = useApi();
  const t = useTranslations('settings.byoc');
  const [carriers, setCarriers] = useState<ExternalCarrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await api.get<ExternalCarrier[]>('/external-carriers');
      if (mounted.current) {
        setCarriers(rows);
        setLoadError(null);
      }
    } catch (reason) {
      if (mounted.current)
        setLoadError(describeApiError(reason, t('loadError')));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const mutate = async (
    method: 'post' | 'patch' | 'delete',
    path: string,
    body?: unknown
  ) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let success = false;
    try {
      await api[method](`/external-carriers${path}`, body);
      success = true;
    } catch (reason) {
      if (mounted.current) setError(describeApiError(reason, t('saveError')));
    } finally {
      // A failed provider operation may still have persisted recoverable state.
      await refresh();
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
    return success;
  };
  return {
    carriers,
    loading,
    busy,
    loadError,
    error,
    refresh,
    mutate,
    clearError: () => setError(null)
  };
}
