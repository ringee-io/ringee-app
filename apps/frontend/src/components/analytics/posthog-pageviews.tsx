'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { capturePageview } from '@ringee/frontend-shared/lib/analytics/posthog';

/**
 * PostHog Web Analytics pageviews (Stage 4B), for every route — marketing,
 * auth and dashboard — and from this one place only, so they never double
 * up with each other or with gtag/Ahrefs. The URL is sanitized before it is
 * sent: only campaign-attribution parameters survive. Renders nothing; a
 * no-op without `NEXT_PUBLIC_POSTHOG_KEY`.
 */
export function PostHogPageviews() {
  const pathname = usePathname();
  useEffect(() => {
    capturePageview();
  }, [pathname]);
  return null;
}
