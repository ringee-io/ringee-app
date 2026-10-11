'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type {
  Campaign,
  CampaignListResponse
} from '@/features/campaigns/types/campaign.types';

/** More than any workspace runs at once; the Campaigns page has every one. */
const LIMIT = 100;

const STORAGE_PREFIX = 'ringee:call-campaign';

/**
 * The campaigns the user can call right now — the active ones in the
 * organization for an admin, the active ones they are assigned to for a member
 * (the API applies the split, CMP-002) — and the one the Campaigns tab shows:
 * the one picked on this visit, else the last one a session was opened with
 * (remembered per user and organization, in this browser), else the newest.
 * Paused, draft and completed campaigns have nothing to dial, so they stay on
 * the Campaigns page.
 */
export function useCallCampaigns() {
  const api = useApi();
  const { isLoaded, userId, orgId } = useAuth();
  const storageKey =
    isLoaded && userId && orgId ? `${STORAGE_PREFIX}:${userId}:${orgId}` : null;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  // The remembered campaign is read before anything is shown, so the newest
  // never flashes in its place.
  const [rememberedRead, setRememberedRead] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!isLoaded) return;
    let saved: string | null = null;
    if (storageKey) {
      try {
        saved = localStorage.getItem(storageKey);
      } catch {
        saved = null;
      }
    }
    setLastSessionId(saved);
    setRememberedRead(true);
  }, [isLoaded, storageKey]);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const res = await api.get<CampaignListResponse>('/campaigns', {
        status: 'active',
        limit: LIMIT
      });
      if (request !== requestRef.current) return;
      setCampaigns(res.data);
      setFailed(false);
    } catch {
      if (request === requestRef.current) setFailed(true);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [api]);

  // Runs again when the active organization changes under the page (a switch
  // in another tab; this one reloads): nothing from the last one carries over,
  // neither its campaigns nor the one picked among them.
  useEffect(() => {
    setCampaigns([]);
    setPickedId(null);
    setLoading(true);
    setFailed(false);
    void refresh();
  }, [refresh, orgId]);

  /** A session opened with this campaign: it is the default from now on. */
  const rememberSession = useCallback(
    (campaignId: string) => {
      setLastSessionId(campaignId);
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, campaignId);
      } catch {
        // Storage unavailable: the default lasts as long as the page.
      }
    },
    [storageKey]
  );

  // The API lists the newest first. A remembered campaign that is no longer
  // active (or no longer the user's) simply is not found.
  const selected =
    campaigns.find((campaign) => campaign.id === pickedId) ??
    campaigns.find((campaign) => campaign.id === lastSessionId) ??
    campaigns[0] ??
    null;

  return {
    campaigns,
    loading: loading || !rememberedRead,
    failed: failed && campaigns.length === 0,
    refresh,
    selected,
    select: setPickedId,
    rememberSession
  };
}
