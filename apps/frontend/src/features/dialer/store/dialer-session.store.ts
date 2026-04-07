'use client';

import { create } from 'zustand';

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
  status: AgentSessionStatus;
  stats: SessionStats;

  setSession: (sessionId: string, campaignId: string) => void;
  setStatus: (status: AgentSessionStatus) => void;
  setStats: (stats: SessionStats) => void;
  clear: () => void;
}

const initialState = {
  sessionId: null as string | null,
  campaignId: null as string | null,
  status: 'offline' as AgentSessionStatus,
  stats: { callsAttempted: 0, callsConnected: 0, totalTalkSec: 0 },
};

export const useDialerSessionStore = create<DialerSessionState>((set) => ({
  ...initialState,

  setSession: (sessionId, campaignId) =>
    set({ sessionId, campaignId, status: 'ready' }),

  setStatus: (status) => set({ status }),

  setStats: (stats) => set({ stats }),

  clear: () => set(initialState),
}));
