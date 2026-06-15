import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { FollowUpRecommendations } from '@/features/ai-pipeline/components/follow-up-recommendations';

export const metadata = {
  title: 'Follow-up Recommendations',
  description: 'Turn every call outcome into the next best action.'
};

export default function FollowUpRecommendationsPage() {
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading
          title='Follow-up Recommendations'
          description='Turn every call outcome into the next best action — analyzed independently per context.'
        />
        <Separator />
        <FollowUpRecommendations />
      </div>
    </PageContainer>
  );
}
