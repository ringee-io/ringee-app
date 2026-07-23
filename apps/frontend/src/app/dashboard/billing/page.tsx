import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { BillingPortalLauncher } from '@/features/billing/components/billing-portal-launcher';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('billing');
  return {
    title: `${t('title')} | Ringee`,
    description: t('description')
  };
}

export default async function BillingPage() {
  const t = await getTranslations('billing');
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-5'>
        <Heading title={t('title')} description={t('description')} />
        <Separator />
        <BillingPortalLauncher />
      </div>
    </PageContainer>
  );
}
