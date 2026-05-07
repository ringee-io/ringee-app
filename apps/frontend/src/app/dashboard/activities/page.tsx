import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { ActivitiesList } from '@/features/activities/components/activities-list';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('activities');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

export default async function ActivitiesPage() {
  const t = await getTranslations('activities');
  return (
    <PageContainer scrollable={true}>
      <div className='flex flex-1 flex-col space-y-4'>
        <div className='flex items-start justify-between'>
          <Heading title={t('title')} description={t('description')} />
        </div>
        <Separator />
        <ActivitiesList />
      </div>
    </PageContainer>
  );
}
