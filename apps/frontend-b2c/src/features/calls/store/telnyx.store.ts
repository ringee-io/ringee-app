'use client';

import { create } from 'zustand';
import { INotification, Call } from '@telnyx/webrtc';

interface TelnyxState {
  client: any | null;
  status: string;
  notification: INotification | null;
  activeCall: Call | null;
  queue: Call[];
  setClient: (client: any) => void;
  setNotification: (n: INotification | null) => void;
  setActiveCall: (call: Call | null) => void;
  enqueue: (call: Call) => void;
  dequeue: (callId: string) => void;
  clear: () => void;
  setStatus: (status: string) => void;
}

export const useTelnyxStore = create<TelnyxState>((set, get) => ({
  client: null,
  status: 'disconnected',
  notification: null,
  activeCall: null,
  queue: [],

  setClient: (client) => set({ client }),
  setStatus: (status) => set({ status }),
  setNotification: (notification) => set({ notification }),
  setActiveCall: (activeCall) => set({ activeCall }),

  enqueue: (call) => {
    const exists = get().queue.some((q) => q.id === call.id);
    if (!exists) set({ queue: [...get().queue, call] });
  },

  dequeue: (callId) =>
    set({ queue: get().queue.filter((q) => q.id !== callId) }),

  clear: () => set({ queue: [], activeCall: null, notification: null })
}));
