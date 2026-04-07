import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { CampaignCreateForm } from '@/features/campaigns/components/campaign-create-form';

export const metadata = {
  title: 'New Campaign | Ringee',
  description: 'Create a new outbound calling campaign.'
};

export default function NewCampaignPage() {
  return (
    <PageContainer scrollable>
      <div className="flex flex-1 flex-col space-y-4">
        <Heading
          title="New Campaign"
          description="Create and configure an outbound calling campaign"
        />
        <Separator />
        <CampaignCreateForm />
      </div>
    </PageContainer>
  );
}
