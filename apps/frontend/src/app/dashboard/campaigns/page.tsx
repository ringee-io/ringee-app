import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { CampaignList } from '@/features/campaigns/components/campaign-list';

export const metadata = {
  title: 'Campaigns — Outbound Calling | Ringee',
  description:
    'Manage your outbound calling campaigns. Create campaigns, import leads, configure dialers, and track performance.'
};

export default function CampaignsPage() {
  return (
    <PageContainer scrollable>
      <div className="flex flex-1 flex-col space-y-4">
        <Heading
          title="Campaigns"
          description="Manage outbound calling campaigns"
        />
        <Separator />
        <CampaignList />
      </div>
    </PageContainer>
  );
}
