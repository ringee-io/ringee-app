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

export type DispositionCategory =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'no_contact';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  dialerMode: DialerMode;
  callerIdId: string | null;
  numberPurchasedId: string | null;
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

export interface Disposition {
  id: string;
  campaignId: string;
  code: string;
  label: string;
  category: DispositionCategory;
  color: string | null;
  sortOrder: number;
  triggersRetry: boolean;
  triggersCompletion: boolean;
  triggersDnc: boolean;
  triggersCallback: boolean;
  isActive: boolean;
  isSystem: boolean;
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
  rotationNumberIds?: string[];
  maxAttempts?: number;
  timezone?: string;
  workStartMin?: number;
  workEndMin?: number;
  workDays?: number[];
  wrapUpTimeSec?: number;
  retryDelayMin?: number;
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
