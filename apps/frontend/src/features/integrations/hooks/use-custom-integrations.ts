'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  CustomIntegrationDeliveryLog,
  CustomIntegrationEventSpec,
  CustomIntegrationEventType,
  CustomIntegrationInboundLog,
  CustomIntegrationStatus,
  CustomIntegrationSummary,
  CustomIntegrationWithSecrets,
  TestWebhookResult,
} from '../types/custom-integrations';

const BASE = '/integrations/custom';

export function useCustomIntegrations() {
  const api = useApi();
  const [items, setItems] = useState<CustomIntegrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CustomIntegrationSummary[]>(BASE);
      setItems(res ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (name: string): Promise<CustomIntegrationWithSecrets> => {
      const res = await api.post<CustomIntegrationWithSecrets>(BASE, { name });
      await load();
      return res;
    },
    [api, load],
  );

  const update = useCallback(
    async (
      id: string,
      patch: {
        name?: string;
        outboundUrl?: string | null;
        subscribedEvents?: CustomIntegrationEventType[];
        status?: CustomIntegrationStatus;
      },
    ): Promise<CustomIntegrationSummary> => {
      const res = await api.patch<CustomIntegrationSummary>(`${BASE}/${id}`, patch);
      await load();
      return res;
    },
    [api, load],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.delete(`${BASE}/${id}`);
      await load();
    },
    [api, load],
  );

  return { items, loading, error, reload: load, create, update, remove };
}

export function useCustomIntegrationActions(id: string | null) {
  const api = useApi();

  const regenerateApiKey = useCallback(async () => {
    if (!id) throw new Error('no id');
    return api.post<{ apiKey: string; apiKeyPrefix: string }>(
      `${BASE}/${id}/regenerate-api-key`,
      {},
    );
  }, [api, id]);

  const regenerateSigningSecret = useCallback(async () => {
    if (!id) throw new Error('no id');
    return api.post<{ signingSecret: string }>(
      `${BASE}/${id}/regenerate-signing-secret`,
      {},
    );
  }, [api, id]);

  const testWebhook = useCallback(async (): Promise<TestWebhookResult> => {
    if (!id) throw new Error('no id');
    return api.post<TestWebhookResult>(`${BASE}/${id}/test-webhook`, {});
  }, [api, id]);

  const getInboundLogs = useCallback(async (): Promise<CustomIntegrationInboundLog[]> => {
    if (!id) return [];
    return api.get<CustomIntegrationInboundLog[]>(`${BASE}/${id}/inbound-logs`);
  }, [api, id]);

  const getOutboundLogs = useCallback(async (): Promise<CustomIntegrationDeliveryLog[]> => {
    if (!id) return [];
    return api.get<CustomIntegrationDeliveryLog[]>(`${BASE}/${id}/outbound-logs`);
  }, [api, id]);

  return {
    regenerateApiKey,
    regenerateSigningSecret,
    testWebhook,
    getInboundLogs,
    getOutboundLogs,
  };
}

export function useCustomIntegrationEventSpecs() {
  const api = useApi();
  const [specs, setSpecs] = useState<CustomIntegrationEventSpec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<CustomIntegrationEventSpec[]>(`${BASE}/event-specs`);
        if (!cancelled) setSpecs(res ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  return { specs, loading };
}
