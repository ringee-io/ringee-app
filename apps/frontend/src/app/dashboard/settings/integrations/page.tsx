import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import IntegrationsViewPage from '@/features/integrations/components/integrations-view-page';

export const metadata = {
  title: 'Integrations | Ringee',
  description: 'Connect your CRM and other tools to Ringee.'
};

export default function Page() {
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading
          title='Integrations'
          description='Sync Ringee call activity to the tools your team already uses.'
        />
        <Separator />
        <IntegrationsViewPage />
      </div>
    </PageContainer>
  );
}
