import { CampaignDetailAnalytics } from '@/features/backoffice/components/campaign-detail-analytics';

export default async function BackofficeCampaignDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CampaignDetailAnalytics id={id} />;
}
