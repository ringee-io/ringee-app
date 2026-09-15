'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, INotification } from '@telnyx/webrtc';
import { useAuth } from '@clerk/nextjs';
import {
  TELNYX_EVENTS,
  buildCallHeaders,
  hangupCall,
  holdCall,
  mapTelnyxState,
  muteCall,
  sendDtmf,
  setOutboundRingbackVolume
} from '@ringee/dialer-core/engine';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useTelnyxStore } from '@/features/calls/store/telnyx.store';
import {
  useDialerAttemptStore,
  type CallAttemptStatus
} from '../store/dialer-attempt.store';
import {
  isLiveCallState,
  useDialerCallStore,
  type DialFailureReason
} from '../store/dialer-call.store';
import { useDialerSessionStore } from '../store/dialer-session.store';

/**
 * States in which the provider has acknowledged the leg. Before `trying` the
 * INVITE has not been accepted, so a leg that ends there never existed as far
 * as the server knows — and nothing but this browser can report it.
 */
const PROVIDER_STATES = [
  'trying',
  'recovering',
  'ringing',
  'answering',
  'early',
  'active',
  'held'
];

/** Attempt statuses in the order a call moves through them. */
const ATTEMPT_PROGRESS: Record<CallAttemptStatus, number> = {
  created: 0,
  dialing: 1,
  ringing: 2,
  answered: 3,
  in_call: 3,
  ended: 4,
  dispositioned: 5
};

/**
 * Report a dial the browser could not place. The server hands the lead back,
 * pauses the session and tells the agent why over `call.blocked`; without this
 * the agent sat in `dialing` for good.
 */
function useAbandonDial() {
  const api = useApi();

  return useCallback(
    (attemptId: string, reason: DialFailureReason) => {
      const sessionId = useDialerSessionStore.getState().sessionId;
      if (!sessionId) return;
      api
        .post('/dialer/abandon', { sessionId, attemptId, reason })
        .catch((err) =>
          console.warn('Could not report the abandoned dial', err)
        );
    },
    [api]
  );
}

/**
 * The tracked leg is over: either it never reached the provider — reported as
 * an abandoned dial — or it is an ordinary end of call.
 */
function settleEndedLeg(
  abandon: (attemptId: string, reason: DialFailureReason) => void
) {
  const tracked = useDialerCallStore.getState();
  useDialerCallStore.getState().clear();
  if (!tracked.attemptId) return;

  if (!tracked.reachedProvider) {
    abandon(tracked.attemptId, tracked.failure ?? 'dial_failed');
    return;
  }
  const attempt = useDialerAttemptStore.getState();
  if (attempt.attemptId === tracked.attemptId) {
    attempt.setCallStatus('ended');
  }
}

/**
 * Places the campaign workspace's calls and follows them. Mount it once — the
 * agent workspace does. Components read {@link useDialerCallStore} and control
 * the leg through {@link useDialerCall}.
 */
export function useDialerCallEngine() {
  const { userId, orgId } = useAuth();
  const client = useTelnyxStore((s) => s.client);
  const abandon = useAbandonDial();
  const abandonRef = useRef(abandon);
  abandonRef.current = abandon;

  // A leg tracked before the workspace last unmounted (the agent left the page
  // mid-call) was followed by nobody since. The SDK's Call object still holds
  // its real state, so stop tracking a leg that ended in the meantime.
  useEffect(() => {
    const tracked = useDialerCallStore.getState();
    if (tracked.callId && !isLiveCallState(tracked.call?.state)) {
      tracked.clear();
    }
  }, []);

  // Every notification, straight from the client. The Telnyx store keeps only
  // the latest one per render, so a burst — `hangup` then `destroy`, or two
  // legs updating together — used to lose the very transition that mattered.
  useEffect(() => {
    if (!client) return;

    const onNotification = (n: INotification) => {
      // The SDK runs every listener in one loop; a throw here would starve
      // the app's other call listeners of this notification.
      try {
        const tracked = useDialerCallStore.getState();
        if (!tracked.callId) return;

        // A microphone failure names no call: the SDK raises it from inside
        // the leg it was setting up, and then hangs that leg up.
        if (n.type === 'userMediaError') {
          if (!tracked.reachedProvider) {
            tracked.update({ failure: 'microphone_unavailable' });
          }
          return;
        }

        const call = n.call as Call | undefined;
        if (n.type !== 'callUpdate' || !call || call.id !== tracked.callId) {
          return;
        }

        const state = call.state;
        if (mapTelnyxState(state) === 'ended') {
          settleEndedLeg(abandonRef.current);
          return;
        }

        useDialerCallStore.getState().update({
          call,
          state,
          reachedProvider:
            tracked.reachedProvider || PROVIDER_STATES.includes(state)
        });

        const attempt = useDialerAttemptStore.getState();
        if (attempt.attemptId !== tracked.attemptId) return;
        const mapped = mapTelnyxState(state);
        const next: CallAttemptStatus =
          mapped === 'ringing'
            ? 'ringing'
            : mapped === 'active' || mapped === 'held'
              ? 'in_call'
              : 'dialing';
        // Forward only: a reconnecting leg reports `recovering`, which must
        // not put a call that is already talking back to "Dialing…".
        const current = attempt.callStatus
          ? ATTEMPT_PROGRESS[attempt.callStatus]
          : -1;
        if (ATTEMPT_PROGRESS[next] > current) {
          attempt.setCallStatus(next);
        }
      } catch (err) {
        console.error('Campaign call notification failed', err);
      }
    };

    client.on(TELNYX_EVENTS.notification, onNotification);
    return () => {
      client.off(TELNYX_EVENTS.notification, onNotification);
    };
  }, [client]);

  const dial = useCallback(
    (phoneNumber: string, callerIdNumber: string | null, attemptId: string) => {
      const live = useDialerCallStore.getState();
      if (live.callId && isLiveCallState(live.state)) {
        // The same instruction delivered twice is already being dialed.
        if (live.attemptId === attemptId) return;
        abandonRef.current(attemptId, 'already_on_call');
        return;
      }

      const telnyx = useTelnyxStore.getState();
      if (!telnyx.client || telnyx.status !== 'registered') {
        abandonRef.current(attemptId, 'line_not_connected');
        return;
      }
      // Placing the call with a fabricated caller ID gets silently rejected by
      // carriers that validate CLI authenticity (e.g. Spain's anti-fraud
      // rules) — refuse instead of dialing with a fake number.
      if (!callerIdNumber || !userId) {
        abandonRef.current(attemptId, 'dial_failed');
        return;
      }

      // Tracked under an id chosen here: `newCall` reports the leg's first
      // state before it even returns the Call.
      const callId = crypto.randomUUID();
      useDialerCallStore.getState().begin(callId, attemptId);

      // Encode the campaign call attempt id into client_state so Telnyx
      // call-control webhooks can be linked back to this CallAttempt on the
      // backend (CallService.extractCallAttemptId). This is what lets the
      // attempt record answeredAt / durationSec, which campaign analytics
      // (connected, contact rate, talk time) are computed from.
      const clientState = btoa(JSON.stringify({ callAttemptId: attemptId }));

      try {
        const call = telnyx.client.newCall({
          id: callId,
          callerNumber: callerIdNumber,
          destinationNumber: phoneNumber,
          audio: true,
          clientState,
          customHeaders: buildCallHeaders({
            callerId: callerIdNumber,
            userId,
            organizationId: orgId ?? undefined
          }),
          keepConnectionAliveOnSocketClose: true,
          debug: process.env.NODE_ENV === 'development',
          debugOutput: 'socket'
        });
        if (useDialerCallStore.getState().callId === callId) {
          useDialerCallStore.getState().update({ call });
        }
        setOutboundRingbackVolume();
      } catch (err) {
        console.error('Could not place the campaign call', err);
        if (useDialerCallStore.getState().callId === callId) {
          useDialerCallStore.getState().clear();
        }
        abandonRef.current(attemptId, 'dial_failed');
      }
    },
    [userId, orgId]
  );

  return { dial };
}

/**
 * The campaign call as the softphone sees it, plus its controls. Safe to use
 * from any component: the leg itself is owned by {@link useDialerCallEngine}.
 */
export function useDialerCall() {
  const api = useApi();
  const abandon = useAbandonDial();
  const activeCall = useDialerCallStore((s) => s.call);
  const callState = useDialerCallStore((s) => s.state);
  const isMuted = useDialerCallStore((s) => s.isMuted);
  const isOnHold = useDialerCallStore((s) => s.isOnHold);
  const isRecording = useDialerCallStore((s) => s.isRecording);
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);

  const toggleMute = useCallback(async () => {
    const { call, isMuted } = useDialerCallStore.getState();
    if (!call) return;
    try {
      await muteCall(call, !isMuted);
      useDialerCallStore.getState().update({ isMuted: !isMuted });
    } catch (err) {
      console.error('Mute error:', err);
    }
  }, []);

  const toggleHold = useCallback(async () => {
    const { call, isOnHold } = useDialerCallStore.getState();
    if (!call) return;
    try {
      await holdCall(call, !isOnHold);
      useDialerCallStore.getState().update({ isOnHold: !isOnHold });
    } catch (err) {
      console.error('Hold error:', err);
    }
  }, []);

  const toggleRecord = useCallback(async () => {
    const { call, isRecording, recordingId } = useDialerCallStore.getState();
    if (!call) return;
    try {
      const sessionId = (call as any).telnyxIDs?.telnyxSessionId;
      if (!sessionId) return;

      if (!isRecording) {
        setIsRecordingLoading(true);
        const res = await api.post<{ id: string }>(
          '/telephony/recordings/start',
          {
            callSessionId: sessionId
          }
        );
        if (res?.id) {
          useDialerCallStore
            .getState()
            .update({ recordingId: res.id, isRecording: true });
        }
      } else {
        if (recordingId) {
          await api.post('/telephony/recordings/stop', {
            recordingId,
            callSessionId: sessionId
          });
        }
        useDialerCallStore
          .getState()
          .update({ recordingId: null, isRecording: false });
      }
    } catch (err) {
      console.error('Record error:', err);
    } finally {
      setIsRecordingLoading(false);
    }
  }, [api]);

  const sendDTMF = useCallback((digit: string) => {
    try {
      sendDtmf(useDialerCallStore.getState().call, digit);
    } catch (err) {
      console.error('DTMF error:', err);
    }
  }, []);

  const hangup = useCallback(async () => {
    const { call, callId, reachedProvider } = useDialerCallStore.getState();
    if (!call) return;
    if (!reachedProvider) {
      useDialerCallStore.getState().update({ failure: 'cancelled' });
    }
    try {
      await hangupCall(call);
    } catch (err) {
      console.error('Hangup error:', err);
    }
    // The SDK announces the hangup synchronously, and the engine settles the
    // leg from that. Should that notification never come, settle it here so
    // the disposition panel still shows.
    if (useDialerCallStore.getState().callId === callId) {
      settleEndedLeg(abandon);
    }
  }, [abandon]);

  return {
    activeCall,
    callState,
    isMuted,
    isOnHold,
    isRecording,
    isRecordingLoading,
    toggleMute,
    toggleHold,
    toggleRecord,
    sendDTMF,
    hangup
  };
}
