import 'server-only';
import { getLocale } from 'next-intl/server';
import type { MarketingLocale } from './locale';

export async function getMarketingLocale(): Promise<MarketingLocale> {
  // next-intl resolves the URL override, cookie and browser language together.
  return (await getLocale()).startsWith('es') ? 'es' : 'en';
}
