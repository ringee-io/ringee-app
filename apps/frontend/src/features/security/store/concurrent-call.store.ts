'use client';

import { create } from 'zustand';

interface ConcurrentCallState {
  open: boolean;
  /**
   * Server copy naming the device that is already busy ("...on the browser
   * extension"). Kept after dismissal so the closing animation doesn't flash an
   * empty dialog.
   */
  message: string | null;
  show: (message?: string | null) => void;
  dismiss: () => void;
}

export const useConcurrentCallStore = create<ConcurrentCallState>()((set) => ({
  open: false,
  message: null,
  show: (message) => set({ open: true, message: message?.trim() || null }),
  dismiss: () => set({ open: false })
}));

/**
 * Raise the "one call at a time" alert from anywhere — including code that
 * isn't a React component, such as the campaign dialer's SSE handlers.
 */
export function notifyConcurrentCall(message?: string | null): void {
  useConcurrentCallStore.getState().show(message);
}
