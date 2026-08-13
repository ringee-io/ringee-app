'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import {
  LOCALE_LABELS,
  LOCALE_FLAGS,
  SUPPORTED_LOCALES,
  type SupportedLocale
} from '@/i18n/config';
import { useLocaleSwitcher } from './use-locale-switcher';

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
  const t = useTranslations('settings.language');
  const { current, pending, setLocale } = useLocaleSwitcher({ onChange });

  return (
    <Select value={current} onValueChange={setLocale} disabled={pending}>
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
