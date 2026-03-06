import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import RecordingsListing from '@/features/recordings/components/recordings.listing';
import { Suspense } from 'react';
import { SearchParams } from 'nuqs/server';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';

export const metadata = {
  title: 'Recordings — Call Recordings | Ringee',
  description: 'Listen and download your encrypted call recordings.'
};

export default async function RecordingsPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParamss = await searchParams;
  searchParamsCache.parse(searchParamss);

  return (
    <div className='flex flex-1 flex-col space-y-4'>
      <Heading
        title='Recordings'
        description='Listen and download your call recordings'
      />
      <Separator />

      <Suspense
        fallback={
          <DataTableSkeleton columnCount={7} rowCount={8} filterCount={2} />
        }
      >
        <RecordingsListing />
      </Suspense>
    </div>
  );
}
