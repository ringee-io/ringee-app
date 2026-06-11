'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import {
  COOKIE_NAME,
  LOCALE_LABELS,
  LOCALE_FLAGS,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale
} from '@/i18n/config';
import { setLocaleAction } from '@/i18n/actions';

const LOCAL_STORAGE_KEY = COOKIE_NAME;

type Props = {
  /** When true, render a compact trigger (icon + flag) suitable for nav bars. */
  compact?: boolean;
  className?: string;
  /** Optional callback after the locale changes successfully. */
  onChange?: (locale: SupportedLocale) => void;
};

/**
 * Lets the user pick the app language.
 * Persists to a cookie (server-readable for SSR) and to localStorage
 * (client-readable for offline / first-paint hints).
 */
export function LanguageSelector({
  compact = false,
  className,
  onChange
}: Props) {
  const locale = useLocale();
  const t = useTranslations('settings.language');
  const tToast = useTranslations('toasts');
  const [pending, startTransition] = React.useTransition();

  const current = isSupportedLocale(locale) ? locale : 'en';

  const handleChange = (next: string) => {
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

  return (
    <Select value={current} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger
        className={className}
        aria-label={t('label')}
        size={compact ? 'sm' : 'default'}
      >
        <SelectValue>
          <span className='flex items-center gap-2'>
            <span aria-hidden='true'>{LOCALE_FLAGS[current]}</span>
            {!compact && <span>{LOCALE_LABELS[current]}</span>}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((loc) => (
          <SelectItem key={loc} value={loc}>
            <span className='flex items-center gap-2'>
              <span aria-hidden='true'>{LOCALE_FLAGS[loc]}</span>
              <span>{LOCALE_LABELS[loc]}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
