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

export function SettingsOverviewView() {
  const t = useTranslations('settings');

  return (
    <Tabs defaultValue='script' className='w-full'>
      <TabsList>
        <TabsTrigger value='script'>{t('tabs.script')}</TabsTrigger>
        <TabsTrigger value='language'>{t('tabs.language')}</TabsTrigger>
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
    </Tabs>
  );
}
