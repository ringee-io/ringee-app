import PageContainer from '@/components/layout/page-container';
import { CampaignDetail } from '@/features/campaigns/components/campaign-detail';

export const metadata = {
  title: 'Campaign Detail | Ringee',
  description: 'View and manage your outbound calling campaign.'
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage(props: Props) {
  const params = await props.params;

  return (
    <PageContainer scrollable>
      <div className="flex flex-1 flex-col space-y-4">
        <CampaignDetail campaignId={params.id} />
      </div>
    </PageContainer>
  );
}
