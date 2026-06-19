import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { RoleGuard } from '@ringee/frontend-shared/components/role-guard';
import { FollowUpRecommendations } from '@/features/ai-pipeline/components/follow-up-recommendations';
import { PipelineIntro } from '@/features/ai-pipeline/components/pipeline-intro';

export const metadata = {
  title: 'Follow-up Recommendations',
  description: 'Turn every call outcome into the next best action.'
};

export default function FollowUpRecommendationsPage() {
  return (
    <PageContainer scrollable>
      <RoleGuard>
        <div className='flex flex-1 flex-col space-y-4'>
          <Heading
            title='Follow-up Recommendations'
            description='Turn every call outcome into the next best action — analyzed independently per context.'
          />
          <Separator />
          <PipelineIntro type='follow_up_recommendations' />
          <FollowUpRecommendations />
        </div>
      </RoleGuard>
    </PageContainer>
  );
}
