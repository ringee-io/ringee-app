'use client';

import { useEffect, useRef } from 'react';
import { useCallStore } from '../store/call.store';
import { useTelnyxStore } from '../store/telnyx.store';

/**
 * Runs `onFinished` when the call screen closes: the call ended and its
 * wrap-up was saved or dismissed. What the call changed — a callback done, a
 * missed call returned — is only worth re-reading then.
 */
export function useCallFinished(onFinished: () => void) {
  const inCall = useTelnyxStore((s) => s.activeCall !== null);
  const wrappingUp = useCallStore((s) => s.postCallPhase);
  const open = inCall || wrappingUp;

  const wasOpen = useRef(open);
  const handler = useRef(onFinished);
  handler.current = onFinished;

  useEffect(() => {
    if (wasOpen.current && !open) handler.current();
    wasOpen.current = open;
  }, [open]);
}
