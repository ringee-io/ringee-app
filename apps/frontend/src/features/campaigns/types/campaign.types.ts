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

export type DispositionCategory = 'positive' | 'neutral' | 'negative' | 'no_contact';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  dialerMode: DialerMode;
  callerIdId: string | null;
  numberPurchasedId: string | null;
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
  contact: {
    id: string;
    name: string;
    phoneNumber: string;
    email: string | null;
    company: string | null;
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
  maxAttempts?: number;
  timezone?: string;
  workStartMin?: number;
  workEndMin?: number;
  workDays?: number[];
  wrapUpTimeSec?: number;
  retryDelayMin?: number;
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
