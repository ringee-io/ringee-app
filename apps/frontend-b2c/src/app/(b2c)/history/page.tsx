import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import CallListingPage from '@/features/history/components/call.history.listing';
import { Suspense } from 'react';
import { SearchParams } from 'nuqs/server';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';

export const metadata = {
  title: 'History — Call History | Ringee',
  description: 'Review your complete call history and track performance.'
};

export default async function HistoryPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParamss = await searchParams;
  searchParamsCache.parse(searchParamss);

  return (
    <div className='flex flex-1 flex-col space-y-4'>
      <Heading title='Call History' description='View your recent calls' />
      <Separator />

      <Suspense
        fallback={
          <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />
        }
      >
        <CallListingPage />
      </Suspense>
    </div>
  );
}
