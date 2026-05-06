'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  COOKIE_NAME,
  DEFAULT_LOCALE,
  isSupportedLocale,
  type SupportedLocale
} from './config';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Persists the chosen locale in a cookie so SSR picks it up on the next
 * request, then revalidates so the new translations propagate immediately.
 * The client also writes to localStorage as a belt-and-suspenders fallback.
 */
export async function setLocaleAction(locale: SupportedLocale): Promise<void> {
  const value = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax'
  });
  revalidatePath('/', 'layout');
}
