import { Suspense } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { RoleGuard } from '@ringee/frontend-shared/components/role-guard';
import { ObjectionIntelligence } from '@/features/ai-pipeline/components/objection-intelligence';
import { PipelineIntro } from '@/features/ai-pipeline/components/pipeline-intro';

export const metadata = {
  title: 'Objection Intelligence',
  description: 'Discover what blocks your prospects and how to respond.'
};

export default function ObjectionIntelligencePage() {
  return (
    <PageContainer scrollable>
      <RoleGuard>
        <div className='flex flex-1 flex-col space-y-4'>
          <Heading
            title='Objection Intelligence'
            description='Discover what blocks your prospects and how to respond — analyzed independently per context.'
          />
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
