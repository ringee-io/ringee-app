import type { DispositionCategory } from '@/features/dispositions/types';

export type DialerMode = 'progressive' | 'preview';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

export type CampaignLeadStatus =
  | 'pending'
  | 'queued'
  | 'locked'
  | 'dialing'
  | 'in_call'
  | 'wrap_up'
  | 'dispositioned'
  | 'scheduled'
  | 'completed'
  | 'exhausted'
  | 'dnc';

// A campaign's dispositions are the dispositions feature's — one type for both.
export type {
  Disposition,
  DispositionCategory
} from '@/features/dispositions/types';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  dialerMode: DialerMode;
  callerIdId: string | null;
  numberPurchasedId: string | null;
  /** A number on the workspace's own carrier; overrides every other number. */
  externalNumberId: string | null;
  rotationNumberIds: string[];
  maxAttempts: number;
  timezone: string;
  workStartMin: number;
  workEndMin: number;
  workDays: number[];
  wrapUpTimeSec: number;
  retryDelayMin: number;
  userId: string;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    leads: number;
  };
  leadCounts?: Record<CampaignLeadStatus, number>;
}

export interface CampaignLead {
  id: string;
  campaignId: string;
  contactId: string;
  listId: string | null;
  status: CampaignLeadStatus;
  priority: number;
  attempts: number;
  lastCallAt: string | null;
  nextCallAt: string | null;
  deadAt: string | null;
  createdAt: string;
  /** How the most recent attempt ended; null until the lead is first dialed. */
  lastAttempt?: CampaignLeadLastAttempt | null;
  contact: {
    id: string;
    name: string;
    phoneNumber: string;
    email: string | null;
    company: string | null;
    jobTitle: string | null;
    locationRegion: string | null;
    websiteUrl: string | null;
    linkedinUrl: string | null;
    revenue: string | null;
    companySize: string | null;
    affiliations: Array<{
      isPrimary: boolean;
      company: { linkedinUrl: string | null };
    }>;
  };
}

export interface CampaignList {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  source: string | null;
  createdAt: string;
  _count?: { leads: number };
}

export interface RetryRule {
  id: string;
  campaignId: string;
  dispositionCategory: DispositionCategory;
  maxAttempts: number;
  delayMinutes: number;
  delayMultiplier: number;
}

export interface CreateCampaignDto {
  name: string;
  description?: string;
  dialerMode?: DialerMode;
  callerIdId?: string;
  numberPurchasedId?: string;
  externalNumberId?: string;
  rotationNumberIds?: string[];
  maxAttempts?: number;
  timezone?: string;
  workStartMin?: number;
  workEndMin?: number;
  workDays?: number[];
  wrapUpTimeSec?: number;
  retryDelayMin?: number;
  /** Workspace dispositions the dialer shows, in order; none = workspace defaults. */
  dispositionIds?: string[];
}

export interface CampaignLeadLastAttempt {
  attemptNumber: number;
  dispositionCode: string | null;
  callId: string | null;
  initiatedAt: string;
  endedAt: string | null;
}

/** `GET /campaigns/:id/analytics/summary`. Rates are already percentages. */
export interface CampaignSummary {
  totalAttempts: number;
  connected: number;
  conversions: number;
  avgHandleTimeSec: number | null;
  uniqueLeadsDialed: number;
  contactRate: number;
  conversionRate: number;
  leadsByStatus?: { status: CampaignLeadStatus; count: number }[];
}

export interface CampaignListResponse {
  data: Campaign[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CampaignLeadListResponse {
  data: CampaignLead[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
