'use client';
import { usePathname } from 'next/navigation';
import { marketingLocaleFromPath } from './locale';

export function useMarketingLocale() {
  return marketingLocaleFromPath(usePathname());
}
