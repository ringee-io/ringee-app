import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { CampaignList } from '@/features/campaigns/components/campaign-list';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('campaigns');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

export default async function CampaignsPage() {
  const t = await getTranslations('campaigns');
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading title={t('title')} description={t('description')} />
        <Separator />
        <CampaignList />
      </div>
    </PageContainer>
  );
}
