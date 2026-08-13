'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { LOCALE_FLAGS, LOCALE_LABELS, SUPPORTED_LOCALES } from '@/i18n/config';
import { useLocaleSwitcher } from './use-locale-switcher';

type Props = {
  className?: string;
};

/**
 * Circular flag button for the app header: shows the current locale's flag
 * and opens a dropdown with every supported language.
 */
export function LanguageSwitcher({ className }: Props) {
  const t = useTranslations('settings.language');
  const { current, pending, setLocale } = useLocaleSwitcher();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          disabled={pending}
          aria-label={`${t('label')}: ${LOCALE_LABELS[current]}`}
          className={cn('relative h-8 w-8 rounded-full p-0', className)}
        >
          <span
            aria-hidden='true'
            className='bg-muted ring-border flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-base leading-none ring-1'
          >
            {LOCALE_FLAGS[current]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='end' sideOffset={10}>
        <DropdownMenuLabel className='text-muted-foreground text-xs font-normal'>
          {t('label')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={current} onValueChange={setLocale}>
          {SUPPORTED_LOCALES.map((loc) => (
            <DropdownMenuRadioItem key={loc} value={loc} disabled={pending}>
              <span aria-hidden='true'>{LOCALE_FLAGS[loc]}</span>
              <span>{LOCALE_LABELS[loc]}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
