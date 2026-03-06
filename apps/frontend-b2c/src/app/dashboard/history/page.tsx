import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import CallListingPage from '@/features/history/components/call.history.listing';
import { Suspense } from 'react';
import { SearchParams } from 'nuqs/server';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';

export const metadata = {
  title: 'Call History — Review and Track Calls | Ringee',
  description:
    'Access your complete Ringee call history. Review past calls, monitor performance, and manage call records with clarity — built for sales teams and professionals.'
};

export default async function Page({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParamss = await searchParams;
  searchParamsCache.parse(searchParamss);

  return (
    <PageContainer scrollable={true}>
      <div className='flex flex-1 flex-col space-y-4'>
        <div className='flex items-start justify-between'>
          <Heading title='Call History' description='View Call History' />
        </div>
        <Separator />

        <Suspense
          fallback={
            <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />
          }
        >
          <CallListingPage />
        </Suspense>
      </div>
    </PageContainer>
  );
}
