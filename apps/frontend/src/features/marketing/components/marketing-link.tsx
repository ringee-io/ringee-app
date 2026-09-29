'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { marketingLocaleFromPath } from '../locale';
import { useMarketingLocale } from '../locale.client';

/**
 * App Router preserves layouts on client navigation. Crossing the marketing
 * language boundary must reload the document so html.lang, the server footer
 * and the root next-intl provider resolve from the new URL together.
 */
export function MarketingLink({ href, ...props }: ComponentProps<typeof Link>) {
  const locale = useMarketingLocale();
  if (
    typeof href === 'string' &&
    href.startsWith('/') &&
    !href.startsWith('//') &&
    marketingLocaleFromPath(href) !== locale
  ) {
    return <a {...props} href={href} />;
  }
  return <Link {...props} href={href} />;
}
