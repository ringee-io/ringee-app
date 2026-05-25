'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, INotification, TelnyxRTC } from '@telnyx/webrtc';
import { sessionApi, type CustomHeader } from './api';

export type CallState =
  | 'idle'
  | 'dialing'
  | 'ringing'
  | 'connected'
  | 'held'
  | 'ended';

interface DialArgs {
  destinationNumber: string;
  callerIdNumber: string | null;
  customHeaders: CustomHeader[];
}

export interface SessionCallHandle {
  call: Call | null;
  callState: CallState;
  isMuted: boolean;
  isOnHold: boolean;
  isRecording: boolean;
  isRecordingLoading: boolean;
  recordingId: string | null;
  telnyxSessionId: string | null;
  dial: (args: DialArgs) => void;
  hangup: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleHold: () => Promise<void>;
  toggleRecording: (params: {
    sessionId: string;
    itemId: string;
    token: string;
  }) => Promise<void>;
  sendDTMF: (digit: string) => void;
}

/**
 * Owns a single outbound WebRTC Call for the magic-link dialer. Mirrors the
 * dashboard's useDialerCall shape but is driven by the Telnyx notification
 * stream rather than a Zustand store.
 */
export function useSessionCall(
  client: TelnyxRTC | null,
  notification: INotification | null,
): SessionCallHandle {
  const callRef = useRef<Call | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [telnyxSessionId, setTelnyxSessionId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Resolve <audio> element to play the remote stream.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let el = document.getElementById(
      'ringee-session-audio',
    ) as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement('audio');
      el.id = 'ringee-session-audio';
      el.autoplay = true;
      // @ts-expect-error playsInline isn't in older TS lib doms
      el.playsInline = true;
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    audioRef.current = el;
  }, []);

  // Track Telnyx callUpdate notifications.
  useEffect(() => {
    if (!notification || notification.type !== 'callUpdate') return;
    const next = (notification as { call?: Call }).call;
    if (!next) return;
    const dir = (next as unknown as { direction?: string }).direction;
    if (dir !== 'outbound') return;

    const state = (next as unknown as { state?: string }).state;

    callRef.current = next;
    setCall(next);
    const sid =
      (next as unknown as { telnyxIDs?: { telnyxSessionId?: string } })
        .telnyxIDs?.telnyxSessionId ?? null;
    if (sid) setTelnyxSessionId(sid);

    if (state === 'new' || state === 'trying' || state === 'requesting') {
      setCallState('dialing');
    } else if (state === 'early' || state === 'answering') {
      setCallState('ringing');
    } else if (state === 'active') {
      setCallState('connected');
    } else if (state === 'held') {
      setCallState('held');
    } else if (state === 'hangup' || state === 'destroy' || state === 'purge') {
      setCallState('ended');
      callRef.current = null;
      setCall(null);
      setIsMuted(false);
      setIsOnHold(false);
      setIsRecording(false);
      setRecordingId(null);
    }

    // Attach the remote stream to our hidden audio element.
    const remote = (next as unknown as { remoteStream?: MediaStream })
      .remoteStream;
    if (remote && audioRef.current) {
      try {
        audioRef.current.srcObject = remote;
        void audioRef.current.play().catch(() => undefined);
      } catch {
        // ignore
      }
    }
  }, [notification]);

  const dial = useCallback(
    ({ destinationNumber, callerIdNumber, customHeaders }: DialArgs) => {
      if (!client) return;
      const callerId = callerIdNumber || '+10000000000';
      const headers = [
        { name: 'From', value: `sip:${callerId}@sip.telnyx.com` },
        { name: 'P-Asserted-Identity', value: `sip:${callerId}@sip.telnyx.com` },
        { name: 'P-Preferred-Identity', value: `sip:${callerId}@sip.telnyx.com` },
        ...customHeaders,
      ];
      client.newCall({
        callerNumber: callerId,
        destinationNumber,
        audio: true,
        customHeaders: headers,
        keepConnectionAliveOnSocketClose: true,
      } as Parameters<TelnyxRTC['newCall']>[0]);
      setCallState('dialing');
      setTelnyxSessionId(null);
    },
    [client],
  );

  const hangup = useCallback(async () => {
    const c = callRef.current;
    if (!c) {
      setCallState('ended');
      return;
    }
    try {
      await c.hangup();
    } catch {
      // ignore
    }
    callRef.current = null;
    setCall(null);
    setCallState('ended');
    setIsMuted(false);
    setIsOnHold(false);
    setIsRecording(false);
    setRecordingId(null);
  }, []);

  const toggleMute = useCallback(async () => {
    const c = callRef.current;
    if (!c) return;
    try {
      if (isMuted) await c.unmuteAudio();
      else await c.muteAudio();
      setIsMuted((v) => !v);
    } catch {
      // ignore
    }
  }, [isMuted]);

  const toggleHold = useCallback(async () => {
    const c = callRef.current;
    if (!c) return;
    try {
      if (isOnHold) {
        await (c as unknown as { unhold: () => Promise<void> }).unhold();
      } else {
        await c.hold();
      }
      setIsOnHold((v) => !v);
    } catch {
      // ignore
    }
  }, [isOnHold]);

  const toggleRecording = useCallback(
    async ({
      sessionId,
      itemId,
      token,
    }: {
      sessionId: string;
      itemId: string;
      token: string;
    }) => {
      if (!callRef.current) return;
      setIsRecordingLoading(true);
      try {
        if (!isRecording) {
          const res = await sessionApi.startRecording(sessionId, itemId, token);
          if (res?.recordingId) {
            setRecordingId(res.recordingId);
            setIsRecording(true);
          }
        } else if (recordingId) {
          await sessionApi.stopRecording(sessionId, itemId, token, recordingId);
          setRecordingId(null);
          setIsRecording(false);
        }
      } catch {
        // surface to caller via local state
      } finally {
        setIsRecordingLoading(false);
      }
    },
    [isRecording, recordingId],
  );

  const sendDTMF = useCallback((digit: string) => {
    const c = callRef.current;
    if (!c) return;
    try {
      c.dtmf(digit);
    } catch {
      // ignore
    }
  }, []);

  return {
    call,
    callState,
    isMuted,
    isOnHold,
    isRecording,
    isRecordingLoading,
    recordingId,
    telnyxSessionId,
    dial,
    hangup,
    toggleMute,
    toggleHold,
    toggleRecording,
    sendDTMF,
  };
}
