import Link from 'next/link';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ringee/frontend-shared/components/ui/tabs';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import { BuyNumberListing } from './buy.number.listing';
import { MyNumberListing } from './my.number.listing';
import { auth } from '@clerk/nextjs/server';

export default async function BuyNumberPage() {
  const tab = searchParamsCache.get('tab') || 'buy';
  const authUser = await auth();

  if (!['buy', 'my-numbers'].includes(tab)) {
    redirect('/dashboard/numbers?tab=buy');
  }

  return (
    <Tabs defaultValue={tab}>
      <TabsList className='w-fit'>
        <TabsTrigger value='buy' asChild>
          <Link href='?tab=buy'>Buy Number</Link>
        </TabsTrigger>
        {authUser?.userId && (
          <TabsTrigger value='my-numbers' asChild>
            <Link href='?tab=my-numbers'>My Numbers</Link>
          </TabsTrigger>
        )}
      </TabsList>

      {tab === 'buy' && (
        <TabsContent value='buy' className='flex flex-1 flex-col space-y-4'>
          <Suspense
            fallback={
              <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />
            }
          >
            <BuyNumberListing />
          </Suspense>
        </TabsContent>
      )}

      {tab === 'my-numbers' && (
        <TabsContent
          value='my-numbers'
          className='flex flex-1 flex-col space-y-4'
        >
          <Suspense
            fallback={
              <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />
            }
          >
            <MyNumberListing />
          </Suspense>
        </TabsContent>
      )}
    </Tabs>
  );
}
