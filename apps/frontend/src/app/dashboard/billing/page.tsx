import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { BillingOverview } from '@/features/billing/components/billing-overview';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { RoleGuard } from '@ringee/frontend-shared/components/role-guard';

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
      <RoleGuard>
        <div className='flex flex-1 flex-col space-y-5'>
          <Heading title={t('title')} description={t('description')} />
          <Separator />
          <BillingOverview />
        </div>
      </RoleGuard>
    </PageContainer>
  );
}
