'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { LanguageSelector } from '@/components/i18n/language-selector';
import { ThemeSelector } from '@ringee/frontend-shared/components/theme-selector';
import { cn } from '@ringee/frontend-shared/lib/utils';

/** One label/description ↔ control row, the layout used across every pane. */
export function SettingsRow({
  label,
  description,
  children
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className='border-border/60 flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6'>
      <div className='min-w-0 space-y-0.5'>
        <p className='text-sm font-medium'>{label}</p>
        {description && (
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {description}
          </p>
        )}
      </div>
      <div className='shrink-0'>{children}</div>
    </div>
  );
}

/** Group heading inside a pane (`Preferences`, `Workspace`, …). */
export function SettingsSectionHeading({ children }: { children: string }) {
  return (
    <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
      {children}
    </h3>
  );
}

const MODES = [
  { value: 'system', icon: Monitor, key: 'system' },
  { value: 'light', icon: Sun, key: 'light' },
  { value: 'dark', icon: Moon, key: 'dark' }
] as const;

/**
 * Explicit system / light / dark picker. The header's `ModeToggle` stays the
 * one-tap flip; this is the settings surface where "follow the OS" is a real
 * choice. Both write through `next-themes`, which owns the value.
 */
function AppearanceModeSelector() {
  const t = useTranslations('settings.appearance');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // `theme` is undefined until next-themes reads storage — render the strip
  // unselected on the server pass instead of flashing the wrong choice.
  React.useEffect(() => setMounted(true), []);

  return (
    <div
      role='radiogroup'
      aria-label={t('theme')}
      className='border-border/60 bg-muted/40 inline-flex gap-1 rounded-lg border p-1'
    >
      {MODES.map(({ value, icon: Icon, key }) => {
        const selected = mounted && theme === value;
        return (
          <button
            key={value}
            type='button'
            role='radio'
            aria-checked={selected}
            title={t(`themes.${key}`)}
            onClick={() => setTheme(value)}
            className={cn(
              'focus-visible:ring-ring flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className='size-3.5' />
            <span className='hidden sm:inline'>{t(`themes.${key}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Appearance + language — the preferences that are not workspace data. */
export function GeneralPanel() {
  const t = useTranslations('settings');
  const tDialog = useTranslations('settings.dialog.general');

  return (
    <div className='space-y-4'>
      <SettingsSectionHeading>{tDialog('preferences')}</SettingsSectionHeading>

      <div className='flex flex-col'>
        <SettingsRow
          label={t('appearance.title')}
          description={t('appearance.description')}
        >
          <AppearanceModeSelector />
        </SettingsRow>

        <SettingsRow
          label={tDialog('colorTheme')}
          description={tDialog('colorThemeDescription')}
        >
          <ThemeSelector />
        </SettingsRow>

        <SettingsRow
          label={t('language.title')}
          description={t('language.description')}
        >
          <LanguageSelector className='w-[200px]' />
        </SettingsRow>
      </div>
    </div>
  );
}
