import { create } from "zustand";
import type { CallOutcome } from "../contracts/call";

export type { CallOutcome };

/**
 * In-call + post-call UI state for a single active call. This is the store the
 * shared Active Call Modal reads from, so the web app and the extension keep
 * the same mute/hold/recording/outcome/notes behavior.
 *
 * The live Telnyx `Call` object is intentionally NOT held here — in the
 * extension it lives in the offscreen document, so the modal must be driven by
 * plain state + callbacks, never a direct WebRTC handle.
 */
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
  callbackScheduled: boolean;
  callDuration: number;
  callContactName: string | null;
  callContactId: string | null;
  callId: string | null;
  callSessionId: string | null;

  // In-call booking panel
  bookingPanelOpen: boolean;

  // In-call actions
  setIsMuted: (v: boolean) => void;
  setIsOnHold: (v: boolean) => void;
  setIsRecording: (v: boolean) => void;
  setRecordingId: (id: string | null) => void;

  // Sync contact & call ID from the call orchestrator
  setCallId: (id: string | null) => void;
  setCallContact: (
    contactId: string | null,
    contactName: string | null,
  ) => void;

  // Post-call actions
  enterPostCallPhase: (data: {
    duration: number;
    contactName: string | null;
    contactId: string | null;
    callId: string | null;
    callSessionId: string | null;
  }) => void;
  setOutcome: (outcome: CallOutcome | null) => void;
  setOutcomeNote: (note: string) => void;
  setMeetingBooked: (booked: boolean) => void;
  setCallbackScheduled: (scheduled: boolean) => void;
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
  outcomeNote: "",
  meetingBooked: false,
  callbackScheduled: false,
  callDuration: 0,
  callContactName: null,
  callContactId: null,
  callId: null,
  callSessionId: null,
  bookingPanelOpen: false,
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
      // Prefer already-resolved contact from setCallContact over hangup values
      callContactName: data.contactName ?? state.callContactName,
      callContactId: data.contactId ?? state.callContactId,
      callId: data.callId ?? state.callId,
      callSessionId: data.callSessionId ?? state.callSessionId,
      bookingPanelOpen: false,
    })),
  setOutcome: (outcome) => set({ outcome }),
  setOutcomeNote: (note) => set({ outcomeNote: note }),
  setMeetingBooked: (booked) =>
    set({
      meetingBooked: booked,
      outcome: booked ? "meeting_booked" : null,
    }),
  setCallbackScheduled: (scheduled) =>
    set({
      callbackScheduled: scheduled,
      outcome: scheduled ? "callback_scheduled" : null,
    }),
  setBookingPanelOpen: (open) => set({ bookingPanelOpen: open }),
  reset: () => set(initialState),
}));
