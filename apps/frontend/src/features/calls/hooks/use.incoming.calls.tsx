'use client';

import { useTelnyxStore } from '../store/telnyx.store';
import { toast } from 'sonner';
import { IncomingCall } from '../components/incoming.call';
import { useEffect, useRef } from 'react';

/**
 * Mirrors the inbound queue onto the screen, one toast per ringing call.
 *
 * The queue is the single source of truth: a call is presented while it is in
 * there and gone as soon as it leaves, whether it was answered, declined, or
 * cancelled by the server because somebody else in the ring group took it.
 * Without that second half a dismissed toast came straight back on the next
 * queue change.
 */
export function useIncomingCallToasts() {
  const queue = useTelnyxStore((s) => s.queue);
  const shown = useRef(new Set<string>());

  useEffect(() => {
    const ringing = new Set(queue.map((call) => call.id));

    for (const id of shown.current)
      if (!ringing.has(id)) {
        toast.dismiss(id);
        shown.current.delete(id);
      }

    queue.forEach((call) => {
      shown.current.add(call.id);
      toast.custom(
        () => (
          <IncomingCall
            key={call.id}
            call={call}
            onClose={() => toast.dismiss(call.id)}
          />
        ),
        { id: call.id, duration: Infinity }
      );
    });
  }, [queue]);

  useEffect(() => {
    const presented = shown.current;
    return () => {
      for (const id of presented) toast.dismiss(id);
      presented.clear();
    };
  }, []);
}
