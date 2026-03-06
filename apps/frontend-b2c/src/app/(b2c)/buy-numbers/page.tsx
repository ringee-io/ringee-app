import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import BuyNumberView from '@/features/number/components/buy.number.view';
import { Suspense } from 'react';
import { SearchParams } from 'nuqs/server';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Buy Numbers — Get a Phone Number | Ringee',
  description:
    'Buy local or international phone numbers to make and receive calls.'
};

export default async function BuyNumbersPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParamss = await searchParams;
  searchParamsCache.parse(searchParamss);

  return (
    <div className='flex flex-1 flex-col space-y-4'>
      <Heading title='Buy Numbers' description='Get a phone number' />
      <Separator />

      <Suspense
        fallback={
          <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />
        }
      >
        <BuyNumberView />
      </Suspense>
    </div>
  );
}
