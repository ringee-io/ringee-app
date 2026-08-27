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

export interface DispositionOption {
  id: string;
  code: string;
  label: string;
  category: string;
  color: string | null;
  triggersCallback: boolean;
}

interface DialerAttemptState {
  attemptId: string | null;
  callStatus: CallAttemptStatus | null;
  callDuration: number;
  dispositionRequired: boolean;
  availableDispositions: DispositionOption[];
  /**
   * An outcome the agent picked from the live popup that still needs the
   * wrap-up form — a callback has to be given a date before it can be saved.
   * The panel opens with it already selected so the click is not lost.
   */
  preselectedDispositionCode: string | null;

  setAttempt: (attemptId: string, status: CallAttemptStatus) => void;
  setCallStatus: (status: CallAttemptStatus) => void;
  setCallDuration: (sec: number) => void;
  setDispositionRequired: (
    required: boolean,
    dispositions?: DispositionOption[]
  ) => void;
  setPreselectedDisposition: (code: string | null) => void;
  clear: () => void;
}

const initialState = {
  attemptId: null as string | null,
  callStatus: null as CallAttemptStatus | null,
  callDuration: 0,
  dispositionRequired: false,
  availableDispositions: [] as DispositionOption[],
  preselectedDispositionCode: null as string | null
};

export const useDialerAttemptStore = create<DialerAttemptState>((set) => ({
  ...initialState,

  setAttempt: (attemptId, status) => set({ attemptId, callStatus: status }),

  setCallStatus: (status) => set({ callStatus: status }),

  setCallDuration: (sec) => set({ callDuration: sec }),

  setDispositionRequired: (required, dispositions) =>
    set({
      dispositionRequired: required,
      ...(dispositions ? { availableDispositions: dispositions } : {})
    }),

  setPreselectedDisposition: (code) =>
    set({ preselectedDispositionCode: code }),

  clear: () => set(initialState)
}));
