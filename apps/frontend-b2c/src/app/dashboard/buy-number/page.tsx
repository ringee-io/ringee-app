import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import BuyNumberView from '@/features/number/components/buy.number.view';
import { Suspense } from 'react';
import { SearchParams } from 'nuqs/server';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Buy Virtual Numbers for Global Calling | Ringee',
  description:
    'Instantly buy local or international phone numbers to make and receive calls with Ringee. Perfect for sales teams, call centers, and global businesses.'
};

export default async function Page({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParamss = await searchParams;
  searchParamsCache.parse(searchParamss);

  return (
    <PageContainer scrollable={false}>
      <div className='flex flex-1 flex-col space-y-4'>
        <div className='flex items-start justify-between'>
          <Heading title='Buy Numbers' description='Manage Numbers' />
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
