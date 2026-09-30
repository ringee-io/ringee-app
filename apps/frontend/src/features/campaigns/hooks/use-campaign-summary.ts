'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { CampaignSummary } from '../types/campaign.types';

/**
 * The campaign's headline numbers. While `live` is set (an active campaign) it
 * refreshes on an interval, so a manager watching the page sees calls land
 * without reloading — but only while the tab is visible.
 */
export function useCampaignSummary(
  campaignId: string,
  { live = false, intervalMs = 30_000 } = {}
) {
  const api = useApi();
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);
  // Refreshes overlap — the interval, a manual refresh, a switch of campaign —
  // and only the latest may land: an older answer, possibly for the campaign
  // before, would overwrite a newer one.
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    const current = () => mountedRef.current && request === requestRef.current;
    try {
      const data = await api.get<CampaignSummary>(
        `/campaigns/${campaignId}/analytics/summary`
      );
      if (!current()) return;
      setSummary(data);
      setError(false);
    } catch {
      if (current()) setError(true);
    } finally {
      if (current()) setLoading(false);
    }
  }, [api, campaignId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [live, intervalMs, refresh]);

  return { summary, loading, error, refresh };
}
