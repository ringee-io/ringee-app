'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  COOKIE_NAME,
  DEFAULT_LOCALE,
  isSupportedLocale,
  type SupportedLocale
} from '@/i18n/config';
import { setLocaleAction } from '@/i18n/actions';

const LOCAL_STORAGE_KEY = COOKIE_NAME;

type Options = {
  /** Optional callback after the locale changes successfully. */
  onChange?: (locale: SupportedLocale) => void;
};

/**
 * Shared locale-switching behaviour for every language picker in the app.
 * Persists to a cookie (server-readable for SSR) and to localStorage
 * (client-readable for offline / first-paint hints).
 */
export function useLocaleSwitcher({ onChange }: Options = {}) {
  const locale = useLocale();
  const t = useTranslations('settings.language');
  const tToast = useTranslations('toasts');
  const [pending, startTransition] = React.useTransition();

  const current = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

  const setLocale = (next: string) => {
    if (!isSupportedLocale(next) || next === current) return;
    try {
      window.localStorage?.setItem(LOCAL_STORAGE_KEY, next);
    } catch {
      // localStorage may be disabled (private mode) — cookie is the source of truth.
    }
    startTransition(async () => {
      try {
        await setLocaleAction(next);
        toast.success(tToast('languageUpdated'));
        onChange?.(next);
      } catch {
        toast.error(t('error'));
      }
    });
  };

  return { current, pending, setLocale };
}
