import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { SettingsOverviewView } from '@/features/settings/components/settings-overview-view';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('settings.overview');
  return {
    title: `${t('title')} | Ringee`,
    description: t('description')
  };
}

export default async function Page() {
  const t = await getTranslations('settings.overview');
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading title={t('title')} description={t('description')} />
        <Separator />
        <SettingsOverviewView />
      </div>
    </PageContainer>
  );
}
