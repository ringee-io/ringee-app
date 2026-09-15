'use client';

import { create } from 'zustand';
import type { Call } from '@telnyx/webrtc';
import { mapTelnyxState } from '@ringee/dialer-core/engine';

/** A Telnyx state in which the leg is still up (or on its way up). */
export function isLiveCallState(state: string | null | undefined): boolean {
  return !!state && mapTelnyxState(state) !== 'ended';
}

/** Why the browser could not place a campaign call, as `POST /dialer/abandon` names it. */
export type DialFailureReason =
  | 'line_not_connected'
  | 'already_on_call'
  | 'microphone_unavailable'
  | 'cancelled'
  | 'dial_failed';

/**
 * The one WebRTC leg the campaign workspace placed, followed by its own id.
 *
 * Shared by the workspace, which places and follows the leg, and the
 * softphone, which controls it — so there is exactly one answer to "which call
 * is ours". Notifications about any other leg are ignored instead of being
 * allowed to overwrite it: a second leg's hangup used to clear the live call,
 * and the hang-up button went with it.
 */
interface DialerCallState {
  call: Call | null;
  /** Telnyx id of the leg — known before the SDK reports anything about it. */
  callId: string | null;
  /** The campaign attempt the leg was placed for. */
  attemptId: string | null;
  /**
   * Last Telnyx state seen for the leg. `Call` mutates in place, so this is
   * what makes components re-render when it changes.
   */
  state: string | null;
  /**
   * The provider acknowledged the leg (`trying` or later). A leg that ends
   * before then never became a call, and the server has to be told so.
   */
  reachedProvider: boolean;
  /** What went wrong, when the browser already knows — reported if the leg never reaches the provider. */
  failure: DialFailureReason | null;
  isMuted: boolean;
  isOnHold: boolean;
  isRecording: boolean;
  recordingId: string | null;

  begin: (callId: string, attemptId: string) => void;
  update: (
    patch: Partial<
      Pick<
        DialerCallState,
        | 'call'
        | 'state'
        | 'reachedProvider'
        | 'failure'
        | 'isMuted'
        | 'isOnHold'
        | 'isRecording'
        | 'recordingId'
      >
    >
  ) => void;
  clear: () => void;
}

const initialState = {
  call: null as Call | null,
  callId: null as string | null,
  attemptId: null as string | null,
  state: null as string | null,
  reachedProvider: false,
  failure: null as DialFailureReason | null,
  isMuted: false,
  isOnHold: false,
  isRecording: false,
  recordingId: null as string | null
};

export const useDialerCallStore = create<DialerCallState>((set) => ({
  ...initialState,

  begin: (callId, attemptId) =>
    set({ ...initialState, callId, attemptId, state: 'new' }),

  update: (patch) => set(patch),

  clear: () => set(initialState)
}));
