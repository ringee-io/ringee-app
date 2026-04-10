'use client';

import { create } from 'zustand';

interface LeadContact {
  id: string;
  name: string;
  phoneNumber: string;
  email: string | null;
  company: string | null;
}

interface CurrentLead {
  id: string;
  campaignLeadId: string;
  contact: LeadContact;
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
  clear: () => set({ currentLead: null }),
}));
