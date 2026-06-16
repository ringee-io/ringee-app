import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { RoleGuard } from '@ringee/frontend-shared/components/role-guard';
import { ObjectionIntelligence } from '@/features/ai-pipeline/components/objection-intelligence';

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
          <ObjectionIntelligence />
        </div>
      </RoleGuard>
    </PageContainer>
  );
}
