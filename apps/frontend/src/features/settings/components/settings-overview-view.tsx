'use client';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { useTranslations } from 'next-intl';
import { ScriptEditor } from './script-editor';
import { LanguageSelector } from '@/components/i18n/language-selector';
import { ThemeSelector } from '@ringee/frontend-shared/components/theme-selector';
import { ModeToggle } from '@/components/layout/ThemeToggle/theme-toggle';

export function SettingsOverviewView() {
  const t = useTranslations('settings');

  return (
    <Tabs defaultValue='script' className='w-full'>
      <TabsList>
        <TabsTrigger value='script'>{t('tabs.script')}</TabsTrigger>
        <TabsTrigger value='language'>{t('tabs.language')}</TabsTrigger>
        <TabsTrigger value='appearance'>{t('tabs.appearance')}</TabsTrigger>
      </TabsList>

      <TabsContent value='script' className='mt-6'>
        <ScriptEditor />
      </TabsContent>

      <TabsContent value='language' className='mt-6'>
        <div className='max-w-md space-y-3'>
          <div>
            <h3 className='text-sm font-medium'>{t('language.title')}</h3>
            <p className='text-muted-foreground text-sm'>
              {t('language.description')}
            </p>
          </div>
          <LanguageSelector />
        </div>
      </TabsContent>

      <TabsContent value='appearance' className='mt-6'>
        <div className='max-w-md space-y-4'>
          <div>
            <h3 className='text-sm font-medium'>{t('appearance.title')}</h3>
            <p className='text-muted-foreground text-sm'>
              {t('appearance.description')}
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <ModeToggle />
            <ThemeSelector />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
