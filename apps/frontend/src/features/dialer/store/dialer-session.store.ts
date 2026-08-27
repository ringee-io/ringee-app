'use client';

import { create } from 'zustand';
import type { DialerMode } from '@/features/campaigns/types/campaign.types';

export type AgentSessionStatus =
  | 'ready'
  | 'reserved'
  | 'dialing'
  | 'in_call'
  | 'wrap_up'
  | 'paused'
  | 'offline';

interface SessionStats {
  callsAttempted: number;
  callsConnected: number;
  totalTalkSec: number;
}

interface DialerSessionState {
  sessionId: string | null;
  campaignId: string | null;
  /** How the campaign dials — the backend returns it when the session starts. */
  dialerMode: DialerMode | null;
  status: AgentSessionStatus;
  stats: SessionStats;
  /**
   * The agent asked to stop after the lead in hand. Held here rather than sent
   * ahead: the server acts on it when the disposition arrives, so ticking and
   * un-ticking the box mid-call costs nothing.
   */
  closeAfterLead: boolean;

  setSession: (
    sessionId: string,
    campaignId: string,
    dialerMode: DialerMode | null
  ) => void;
  setStatus: (status: AgentSessionStatus) => void;
  setStats: (stats: SessionStats) => void;
  setCloseAfterLead: (closeAfterLead: boolean) => void;
  clear: () => void;
}

const initialState = {
  sessionId: null as string | null,
  campaignId: null as string | null,
  dialerMode: null as DialerMode | null,
  status: 'offline' as AgentSessionStatus,
  stats: { callsAttempted: 0, callsConnected: 0, totalTalkSec: 0 },
  closeAfterLead: false
};

export const useDialerSessionStore = create<DialerSessionState>((set) => ({
  ...initialState,

  setSession: (sessionId, campaignId, dialerMode) =>
    set({ sessionId, campaignId, dialerMode, status: 'ready' }),

  setStatus: (status) => set({ status }),

  setStats: (stats) => set({ stats }),

  setCloseAfterLead: (closeAfterLead) => set({ closeAfterLead }),

  clear: () => set(initialState)
}));
