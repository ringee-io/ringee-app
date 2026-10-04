'use client';

import { useEffect, useRef } from 'react';
import { useCallStore } from '../store/call.store';
import { useTelnyxStore } from '../store/telnyx.store';

export function useIncomingAudioListener() {
  const { queue, activeCall } = useTelnyxStore();
  /**
   * A call that ended stays `activeCall` until its wrap-up is closed. A call
   * ringing behind the wrap-up must still be heard: it was silent, and only
   * started ringing once the wrap-up closed.
   */
  const wrappingUp = useCallStore((s) => s.postCallPhase);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    ringtoneRef.current = new Audio('/sounds/inbound-call.mp3');
    ringtoneRef.current.loop = true;
  }, []);

  useEffect(() => {
    if (!ringtoneRef.current) return;

    const hasIncoming = queue.some(
      (call) =>
        ['ringing', 'trying', 'requesting'].includes(call.state) &&
        call.direction === 'inbound'
    );

    if (hasIncoming && (!activeCall || wrappingUp)) {
      ringtoneRef.current
        .play()
        .catch((err) => console.warn('Autoplay blocked', err));
    } else {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  }, [queue, activeCall, wrappingUp]);

  useEffect(() => {
    return () => {
      ringtoneRef.current?.pause();
      ringtoneRef.current = null;
    };
  }, []);
}
