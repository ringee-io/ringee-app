'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  EnrichmentConnectionSummary,
  EnrichmentJobRow,
  EnrichmentProviderType,
  LeadSearchFilters,
  LeadSearchJobDto
} from '../types/enrichment';

export function useEnrichmentConnections() {
  const api = useApi();
  const [connections, setConnections] = useState<EnrichmentConnectionSummary[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<EnrichmentConnectionSummary[]>(
        '/enrichment/connections'
      );
      setConnections(res ?? []);
    } catch (err) {
      // 404 means feature flag is off — treat as no connections, no error
      const status = (err as { status?: number })?.status;
      if (status === 404) {
        setConnections([]);
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load enrichment connections'
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

export function useContactEnrichmentJobs(contactId: string | null) {
  const api = useApi();
  const [jobs, setJobs] = useState<EnrichmentJobRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!contactId) {
      setJobs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<EnrichmentJobRow[]>(
        `/enrichment/contacts/${contactId}/jobs`
      );
      setJobs(res ?? []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [api, contactId]);

  useEffect(() => {
    load();
  }, [load]);

  return { jobs, loading, reload: load };
}

export function useEnrichmentMutations() {
  const api = useApi();

  const validate = useCallback(
    async (provider: EnrichmentProviderType, apiKey: string) => {
      return api.post<{ accountId: string; accountName: string | null }>(
        `/enrichment/${provider}/validate`,
        { apiKey }
      );
    },
    [api]
  );

  const connect = useCallback(
    async (provider: EnrichmentProviderType, apiKey: string) => {
      return api.post<{ id: string; status: string }>(
        `/enrichment/${provider}/connect`,
        {
          apiKey
        }
      );
    },
    [api]
  );

  const disconnect = useCallback(
    async (id: string) =>
      api.delete<{ ok: true }>(`/enrichment/connections/${id}`),
    [api]
  );

  const enrichContact = useCallback(
    async (
      contactId: string,
      opts?: { provider?: EnrichmentProviderType; waterfall?: boolean }
    ) =>
      api.post<EnrichmentJobRow>(
        `/enrichment/contacts/${contactId}/enrich`,
        opts ?? {}
      ),
    [api]
  );

  const enrichBulk = useCallback(
    async (
      contactIds: string[],
      opts?: { provider?: EnrichmentProviderType; waterfall?: boolean }
    ) =>
      api.post<{ jobIds: string[] }>('/enrichment/contacts/enrich-bulk', {
        contactIds,
        ...(opts ?? {})
      }),
    [api]
  );

  const searchLeads = useCallback(
    async (
      filters: LeadSearchFilters,
      opts?: {
        provider?: EnrichmentProviderType;
        page?: number;
        perPage?: number;
        useCache?: boolean;
      }
    ) =>
      api.post<LeadSearchJobDto>('/enrichment/leads/search', {
        filters,
        ...(opts ?? {})
      }),
    [api]
  );

  const searchLeadsByLinkedin = useCallback(
    async (
      linkedinUrl: string,
      opts?: { provider?: EnrichmentProviderType; useCache?: boolean }
    ) =>
      api.post<LeadSearchJobDto>('/enrichment/leads/search-by-linkedin', {
        linkedinUrl,
        ...(opts ?? {})
      }),
    [api]
  );

  const importLeads = useCallback(
    async (candidates: unknown[], tagIds?: string[]) =>
      api.post<{
        importedContactIds: string[];
        duplicates: number;
        errors: number;
      }>('/enrichment/leads/import', { candidates, tagIds }),
    [api]
  );

  const revealContact = useCallback(
    async (
      contactId: string,
      opts?: { revealPhone?: boolean; revealEmail?: boolean }
    ) =>
      api.post<{
        contactId: string;
        emailRevealed: boolean;
        phoneRevealed: boolean;
        provider: EnrichmentProviderType;
      }>(`/enrichment/contacts/${contactId}/reveal`, opts ?? {}),
    [api]
  );

  const revealLeadContact = useCallback(
    async (
      jobId: string,
      externalId: string,
      opts?: { revealPhone?: boolean }
    ) =>
      api.post<{
        candidate: import('../types/enrichment').LeadCandidate;
        contactId: string | null;
        emailRevealed: boolean;
        phoneRevealed: boolean;
      }>(
        `/enrichment/leads/jobs/${jobId}/candidates/${encodeURIComponent(externalId)}/reveal`,
        { revealPhone: opts?.revealPhone ?? false }
      ),
    [api]
  );

  return {
    validate,
    connect,
    disconnect,
    enrichContact,
    enrichBulk,
    searchLeads,
    searchLeadsByLinkedin,
    importLeads,
    revealLeadContact,
    revealContact
  };
}
