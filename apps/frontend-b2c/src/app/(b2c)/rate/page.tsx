import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { RateClient } from '@/features/rate/components/rate';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { Suspense } from 'react';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Call Rates — Ringee',
  description:
    'View calling rates to 180+ countries. Pay as you go pricing with no hidden fees.'
};

export default async function RatePage() {
  const rates = await apiServer.get('/telephony/rates');

  return (
    <div className='flex flex-1 flex-col space-y-4'>
      <Heading
        title='Call Rates'
        description='View rates to call any country worldwide'
      />
      <Separator />

      <Suspense
        fallback={
          <DataTableSkeleton columnCount={3} rowCount={10} filterCount={1} />
        }
      >
        <RateClient initialRates={rates} />
      </Suspense>
    </div>
  );
}
