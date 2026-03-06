'use client';

import { useEffect, useRef } from 'react';
import { useTelnyxStore } from '../store/telnyx.store';

export function useIncomingAudioListener() {
  const { queue, activeCall } = useTelnyxStore();
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

    if (hasIncoming && !activeCall) {
      ringtoneRef.current
        .play()
        .catch((err) => console.warn('Autoplay blocked', err));
    } else {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  }, [queue, activeCall]);

  useEffect(() => {
    return () => {
      ringtoneRef.current?.pause();
      ringtoneRef.current = null;
    };
  }, []);
}
