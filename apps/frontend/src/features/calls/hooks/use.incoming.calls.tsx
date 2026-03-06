'use client';

import { useTelnyxStore } from '../store/telnyx.store';
import { toast } from 'sonner';
import { IncomingCall } from '../components/incoming.call';
import { useEffect } from 'react';

export function useIncomingCallToasts() {
  const { queue } = useTelnyxStore();

  useEffect(() => {
    queue.forEach((call) => {
      toast.custom(
        (t) => (
          <IncomingCall
            key={call.id}
            call={call}
            onClose={() => toast.dismiss(t)}
          />
        ),
        { id: call.id, duration: Infinity }
      );
    });
  }, [queue]);
}
