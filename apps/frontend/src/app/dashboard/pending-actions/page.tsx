import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { PendingActionsList } from '@/features/pending-actions/components/pending-actions-list';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('ai.pendingActions');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function PendingActionsPage() {
  const t = await getTranslations('ai.pendingActions');
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading title={t('title')} description={t('description')} />
        <Separator />
        <PendingActionsList />
      </div>
    </PageContainer>
  );
}
