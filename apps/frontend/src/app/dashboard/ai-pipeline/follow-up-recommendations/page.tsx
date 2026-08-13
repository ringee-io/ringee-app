import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { RoleGuard } from '@ringee/frontend-shared/components/role-guard';
import { FollowUpRecommendations } from '@/features/ai-pipeline/components/follow-up-recommendations';
import { PipelineIntro } from '@/features/ai-pipeline/components/pipeline-intro';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('ai.followUp.page');
  return { title: t('title'), description: t('description') };
}

export default async function FollowUpRecommendationsPage() {
  const t = await getTranslations('ai.followUp.page');
  return (
    <PageContainer scrollable>
      <RoleGuard>
        <div className='flex flex-1 flex-col space-y-4'>
          <Heading title={t('title')} description={t('longDescription')} />
          <Separator />
          <PipelineIntro type='follow_up_recommendations' />
          <FollowUpRecommendations />
        </div>
      </RoleGuard>
    </PageContainer>
  );
}
