import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import BuyNumberView from '@/features/number/components/buy.number.view';
import { Suspense } from 'react';
import { SearchParams } from 'nuqs/server';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { Metadata } from 'next';
import { BuyNumberOnboardingTrigger } from '@/features/onboarding/components/buy-number-onboarding-trigger';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.numbers');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

export default async function Page({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParamss = await searchParams;
  searchParamsCache.parse(searchParamss);
  const t = await getTranslations('settings.numbers');

  return (
    <PageContainer scrollable={false}>
      <BuyNumberOnboardingTrigger />
      <div className='flex flex-1 flex-col space-y-4'>
        <div className='flex items-start justify-between'>
          <Heading title={t('title')} description={t('description')} />
        </div>
        <Separator />

        <Suspense
          fallback={
            <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />
          }
        >
          <BuyNumberView />
        </Suspense>
      </div>
    </PageContainer>
  );
}
