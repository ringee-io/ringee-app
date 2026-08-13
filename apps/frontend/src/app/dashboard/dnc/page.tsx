import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DNCList } from '@/features/dnc/components/dnc-list';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('calls.dnc');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function DNCPage() {
  const t = await getTranslations('calls.dnc');
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading title={t('title')} description={t('description')} />
        <Separator />
        <DNCList />
      </div>
    </PageContainer>
  );
}
