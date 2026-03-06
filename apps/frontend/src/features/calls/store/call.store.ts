'use client';

import { create } from 'zustand';

interface CallState {
  isMuted: boolean;
  isOnHold: boolean;
  isRecording: boolean;
  recordingId: string | null;
  setIsMuted: (v: boolean) => void;
  setIsOnHold: (v: boolean) => void;
  setIsRecording: (v: boolean) => void;
  setRecordingId: (id: string | null) => void;
  reset: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  isMuted: false,
  isOnHold: false,
  isRecording: false,
  recordingId: null,
  setIsMuted: (v) => set({ isMuted: v }),
  setIsOnHold: (v) => set({ isOnHold: v }),
  setIsRecording: (v) => set({ isRecording: v }),
  setRecordingId: (id) => set({ recordingId: id }),
  reset: () =>
    set({
      isMuted: false,
      isOnHold: false,
      isRecording: false,
      recordingId: null
    })
}));
