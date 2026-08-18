'use client';

import { useMemo } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';

export type OfferPlacement =
  | 'TOP_BANNER'
  | 'DASHBOARD_CARD'
  | 'MODAL'
  | 'SIDEBAR'
  | 'SETTINGS'
  | 'CHECKOUT'
  | 'CAMPAIGN_PAGE'
  | 'INBOX';

export type OfferActionType =
  | 'EXTERNAL_URL_SUBMISSION'
  | 'INTERNAL_ACTION'
  | 'CTA_ONLY';

export type OfferParticipationStatus =
  | 'ELIGIBLE'
  | 'STARTED'
  | 'SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'REWARDED';

/**
 * Exactly what the backend decided to show. Copy is already rendered and
 * amounts are already computed — the client never derives either, and never
 * learns an offer's rules.
 */
export interface Offer {
  id: string;
  slug: string;
  placement: OfferPlacement;
  priority: number;
  title: string;
  description: string | null;
  cta: { label: string };
  dismissible: boolean;
  reward: {
    type: 'CREDIT' | 'NONE';
    amount: number;
    potentialAmount: number;
    currency: string;
    destination: string;
  };
  eligibleParticipants: number;
  remainingParticipants: number;
  action: {
    type: OfferActionType;
    field: string | null;
    fieldLabel: string | null;
    fieldPlaceholder: string | null;
    helpText: string | null;
    /** Optional screenshot showing where to find the value we're asking for. */
    helpImage: string | null;
    helpImageAlt: string | null;
    submitLabel: string | null;
    href: string | null;
    hrefLabel: string | null;
    allowedDomains: string[];
  };
  requiresApproval: boolean;
  participation: {
    id: string;
    status: OfferParticipationStatus;
    submittedAt: string | null;
    rewardedAt: string | null;
    rejectionReason: string | null;
  } | null;
  endsAt: string | null;
}

const BASE = '/offers';

export function useOffersApi() {
  const api = useApi();

  return useMemo(
    () => ({
      listAvailable: (params?: {
        placement?: OfferPlacement;
        limit?: number;
      }) => api.get<{ offers: Offer[] }>(`${BASE}/available`, params),

      get: (idOrSlug: string) => api.get<Offer>(`${BASE}/${idOrSlug}`),

      start: (idOrSlug: string) =>
        api.post<Offer>(`${BASE}/${idOrSlug}/start`, {}),

      /** The only thing the client is allowed to send. */
      submit: (idOrSlug: string, submissionData: Record<string, unknown>) =>
        api.post<Offer>(`${BASE}/${idOrSlug}/submit`, { submissionData }),

      dismiss: (idOrSlug: string) =>
        api.post<{ dismissed: boolean }>(`${BASE}/${idOrSlug}/dismiss`, {}),

      track: (idOrSlug: string, event: 'impression' | 'clicked') =>
        api.post<{ tracked: boolean }>(`${BASE}/${idOrSlug}/track`, { event })
    }),
    [api]
  );
}
