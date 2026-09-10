'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

/**
 * Reports the outcome of a calendar OAuth round-trip.
 *
 * The provider sends the browser back to a Ringee URL carrying
 * `?calendar=connected|error&provider=…`. The surface that started the flow is
 * long gone by then — it was a full page navigation — so whichever calendar
 * pane mounts next is the one that has to announce the result and tidy the URL.
 * Both panes call this, only one is ever mounted, and the ref keeps a re-render
 * from toasting twice.
 *
 * @param onConnected refetch for the pane, run only on success. Must be stable.
 */
export function useCalendarConnectionResult(onConnected?: () => void) {
  const t = useTranslations('meetings.integrations');
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    const params = new URLSearchParams(window.location.search);
    const status = params.get('calendar');
    if (status !== 'connected' && status !== 'error') return;
    handled.current = true;

    const provider = params.get('provider');
    if (status === 'connected') {
      toast.success(
        t('connectedSuccess', {
          provider: provider
            ? t(`providers.${provider}.name`)
            : t('providerFallback')
        })
      );
      onConnected?.();
    } else {
      toast.error(t('connectFailed'));
    }

    const url = new URL(window.location.href);
    url.searchParams.delete('calendar');
    url.searchParams.delete('provider');
    window.history.replaceState({}, '', url.toString());
  }, [t, onConnected]);
}
