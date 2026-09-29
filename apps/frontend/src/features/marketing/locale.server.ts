import 'server-only';
import { headers } from 'next/headers';
import type { MarketingLocale } from './locale';

export async function getMarketingLocale(): Promise<MarketingLocale> {
  return (await headers()).get('x-ringee-locale') === 'es' ? 'es' : 'en';
}
