'use client';
import { useLocale } from 'next-intl';

export function useMarketingLocale() {
  const locale = useLocale();
  // Match the page copy, including the home page's cookie/browser language.
  return locale.startsWith('es') ? 'es' : 'en';
}
