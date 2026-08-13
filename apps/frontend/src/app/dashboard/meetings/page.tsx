import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { MeetingsList } from '@/features/meetings/components/meetings-list';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('meetings');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function MeetingsPage() {
  const t = await getTranslations('meetings');
  return (
    <PageContainer scrollable={true}>
      <div className='flex flex-1 flex-col space-y-4'>
        <div className='flex items-start justify-between'>
          <Heading title={t('title')} description={t('description')} />
        </div>
        <Separator />
        <MeetingsList />
      </div>
    </PageContainer>
  );
}
