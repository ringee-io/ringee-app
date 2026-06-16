import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { RoleGuard } from '@ringee/frontend-shared/components/role-guard';
import { AiPipelineCards } from '@/features/ai-pipeline/components/ai-pipeline-cards';

export const metadata = {
  title: 'AI Pipeline',
  description:
    'Configuration + intelligence: turn call outcomes into the next best action.'
};

export default function AiPipelinePage() {
  return (
    <PageContainer scrollable>
      <RoleGuard>
        <div className='flex flex-1 flex-col space-y-4'>
          <Heading
            title='AI Pipeline'
            description='Independent pipelines that analyze your calls by context. Enable a pipeline to start turning outcomes into actions.'
          />
          <Separator />
          <AiPipelineCards />
        </div>
      </RoleGuard>
    </PageContainer>
  );
}
