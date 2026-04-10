'use client';

import { create } from 'zustand';

export type CallOutcome =
  | 'meeting_booked'
  | 'sale'
  | 'interested'
  | 'follow_up'
  | 'not_interested'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number'
  | 'gatekeeper';

interface CallState {
  // In-call state
  isMuted: boolean;
  isOnHold: boolean;
  isRecording: boolean;
  recordingId: string | null;

  // Post-call state
  postCallPhase: boolean;
  outcome: CallOutcome | null;
  outcomeNote: string;
  meetingBooked: boolean;
  callDuration: number;
  callContactName: string | null;
  callContactId: string | null;
  callId: string | null;

  // In-call booking panel
  bookingPanelOpen: boolean;

  // In-call actions
  setIsMuted: (v: boolean) => void;
  setIsOnHold: (v: boolean) => void;
  setIsRecording: (v: boolean) => void;
  setRecordingId: (id: string | null) => void;

  // Sync contact & call ID from ShowActiveCall
  setCallId: (id: string | null) => void;
  setCallContact: (contactId: string | null, contactName: string | null) => void;

  // Post-call actions
  enterPostCallPhase: (data: {
    duration: number;
    contactName: string | null;
    contactId: string | null;
    callId: string | null;
  }) => void;
  setOutcome: (outcome: CallOutcome | null) => void;
  setOutcomeNote: (note: string) => void;
  setMeetingBooked: (booked: boolean) => void;
  setBookingPanelOpen: (open: boolean) => void;
  reset: () => void;
}

const initialState = {
  isMuted: false,
  isOnHold: false,
  isRecording: false,
  recordingId: null,
  postCallPhase: false,
  outcome: null,
  outcomeNote: '',
  meetingBooked: false,
  callDuration: 0,
  callContactName: null,
  callContactId: null,
  callId: null,
  bookingPanelOpen: false
};

export const useCallStore = create<CallState>((set) => ({
  ...initialState,

  setIsMuted: (v) => set({ isMuted: v }),
  setIsOnHold: (v) => set({ isOnHold: v }),
  setIsRecording: (v) => set({ isRecording: v }),
  setRecordingId: (id) => set({ recordingId: id }),

  setCallId: (id) => set({ callId: id }),
  setCallContact: (contactId, contactName) =>
    set({ callContactId: contactId, callContactName: contactName }),

  enterPostCallPhase: (data) =>
    set((state) => ({
      postCallPhase: true,
      callDuration: data.duration,
      // Prefer already-resolved contact from setCallContact over hangup listener values
      callContactName: data.contactName ?? state.callContactName,
      callContactId: data.contactId ?? state.callContactId,
      callId: data.callId ?? state.callId,
      bookingPanelOpen: false
    })),
  setOutcome: (outcome) => set({ outcome }),
  setOutcomeNote: (note) => set({ outcomeNote: note }),
  setMeetingBooked: (booked) =>
    set({
      meetingBooked: booked,
      outcome: booked ? 'meeting_booked' : null
    }),
  setBookingPanelOpen: (open) => set({ bookingPanelOpen: open }),
  reset: () => set(initialState)
}));
