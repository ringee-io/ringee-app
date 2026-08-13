import { Suspense } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { RoleGuard } from '@ringee/frontend-shared/components/role-guard';
import { ObjectionIntelligence } from '@/features/ai-pipeline/components/objection-intelligence';
import { PipelineIntro } from '@/features/ai-pipeline/components/pipeline-intro';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('ai.objections.page');
  return { title: t('title'), description: t('description') };
}

export default async function ObjectionIntelligencePage() {
  const t = await getTranslations('ai.objections.page');
  return (
    <PageContainer scrollable>
      <RoleGuard>
        <div className='flex flex-1 flex-col space-y-4'>
          <Heading title={t('title')} description={t('longDescription')} />
          <Separator />
          <PipelineIntro type='objection_intelligence' />
          <Suspense fallback={<Skeleton className='h-96 w-full rounded-xl' />}>
            <ObjectionIntelligence />
          </Suspense>
        </div>
      </RoleGuard>
    </PageContainer>
  );
}
