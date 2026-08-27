'use client';

import { create } from 'zustand';

/**
 * Everything the backend hands an agent about the person they are calling
 * (`CampaignLeadContact`). Wider than what it takes to place the call on
 * purpose: whoever answers expects to be known, and an agent who has to leave
 * the dialer to look up the company has already lost the opening.
 */
export interface LeadContact {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  email: string | null;

  // Role
  jobTitle: string | null;
  seniority: string | null;
  department: string | null;
  headline: string | null;
  summary: string | null;
  linkedinUrl: string | null;

  // Company
  company: string | null;
  revenue: string | null;
  companySize: string | null;
  websiteUrl: string | null;

  // Where they are — `locationRegion` is the state / province
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  timezone: string | null;

  // Where they stand
  status: string | null;
  lifecycleStage: string | null;
  score: number | null;
  source: string | null;
  lastCallAt: string | null;
  customFields: Record<string, unknown> | null;
}

interface CurrentLead {
  id: string;
  campaignLeadId: string;
  contact: LeadContact;
  /** Whatever the import or the list attached to this lead. */
  metadata: Record<string, unknown> | null;
  attempts: number;
  priority: number;
  history: Array<{
    attemptNumber: number;
    dispositionCode: string | null;
    endedAt: string | null;
    durationSec: number | null;
  }>;
}

interface DialerLeadState {
  currentLead: CurrentLead | null;
  setLead: (lead: CurrentLead) => void;
  clear: () => void;
}

export const useDialerLeadStore = create<DialerLeadState>((set) => ({
  currentLead: null,
  setLead: (lead) => set({ currentLead: lead }),
  clear: () => set({ currentLead: null })
}));
