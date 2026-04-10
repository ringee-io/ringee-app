'use client';

import { create } from 'zustand';

export type CallAttemptStatus =
  | 'created'
  | 'dialing'
  | 'ringing'
  | 'answered'
  | 'in_call'
  | 'ended'
  | 'dispositioned';

interface DialerAttemptState {
  attemptId: string | null;
  callStatus: CallAttemptStatus | null;
  callDuration: number;
  dispositionRequired: boolean;
  availableDispositions: Array<{
    id: string;
    code: string;
    label: string;
    category: string;
    color: string | null;
    triggersCallback: boolean;
  }>;

  setAttempt: (attemptId: string, status: CallAttemptStatus) => void;
  setCallStatus: (status: CallAttemptStatus) => void;
  setCallDuration: (sec: number) => void;
  setDispositionRequired: (
    required: boolean,
    dispositions?: DialerAttemptState['availableDispositions']
  ) => void;
  clear: () => void;
}

const initialState = {
  attemptId: null as string | null,
  callStatus: null as CallAttemptStatus | null,
  callDuration: 0,
  dispositionRequired: false,
  availableDispositions: [] as DialerAttemptState['availableDispositions'],
};

export const useDialerAttemptStore = create<DialerAttemptState>((set) => ({
  ...initialState,

  setAttempt: (attemptId, status) => set({ attemptId, callStatus: status }),

  setCallStatus: (status) => set({ callStatus: status }),

  setCallDuration: (sec) => set({ callDuration: sec }),

  setDispositionRequired: (required, dispositions) =>
    set({
      dispositionRequired: required,
      ...(dispositions ? { availableDispositions: dispositions } : {}),
    }),

  clear: () => set(initialState),
}));
