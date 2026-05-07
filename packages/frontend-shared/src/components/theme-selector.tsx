'use client';

import { useThemeConfig } from './active-theme';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  // SelectSeparator,
  SelectTrigger,
  SelectValue
} from './ui/select';
import { useTranslations } from 'next-intl';

// const DEFAULT_THEMES = [
//   {
//     name: 'Default',
//     value: 'default'
//   },
//   {
//     name: 'Blue',
//     value: 'blue'
//   },
//   {
//     name: 'Green',
//     value: 'green'
//   },
//   {
//     name: 'Amber',
//     value: 'amber'
//   }
// ];

const SCALED_THEMES = [
  {
    name: 'Default',
    value: 'default-scaled'
  }
  // {
  //   name: 'Blue',
  //   value: 'blue-scaled'
  // }
];

const MONO_THEMES = [
  {
    name: 'Mono',
    value: 'mono-scaled'
  }
];

export function ThemeSelector() {
  const { activeTheme, setActiveTheme } = useThemeConfig();
  const t = useTranslations('common');

  return (
    <div className='flex items-center gap-2'>
      <Label htmlFor='theme-selector' className='sr-only'>
        {t('theme')}
      </Label>
      <Select value={activeTheme} onValueChange={setActiveTheme}>
        <SelectTrigger
          id='theme-selector'
          className='justify-start *:data-[slot=select-value]:w-12'
        >
          <span className='text-muted-foreground hidden sm:block'>
            {t('selectTheme')}
          </span>
          <span className='text-muted-foreground block sm:hidden'>{t('theme')}</span>
          <SelectValue placeholder={t('selectThemePlaceholder')} />
        </SelectTrigger>
        <SelectContent align='end'>
          {/* <SelectGroup>
            <SelectLabel>Default</SelectLabel>
            {DEFAULT_THEMES.map((theme) => (
              <SelectItem key={theme.name} value={theme.value}>
                {theme.name}
              </SelectItem>
            ))}
          </SelectGroup> */}
          {/* <SelectSeparator /> */}
          <SelectGroup>
            <SelectLabel>Default</SelectLabel>
            {SCALED_THEMES.map((theme) => (
              <SelectItem key={theme.name} value={theme.value}>
                {theme.name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Monospaced</SelectLabel>
            {MONO_THEMES.map((theme) => (
              <SelectItem key={theme.name} value={theme.value}>
                {theme.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
