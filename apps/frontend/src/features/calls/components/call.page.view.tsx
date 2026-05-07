import Link from 'next/link';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ringee/frontend-shared/components/ui/tabs';
import { Suspense } from 'react';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import ContactListingPage from '@/features/contact/components/contact.listing';
import { Dialer } from './dialer';
import CallHistoryListing from '@/features/history/components/call.history.listing';
import { getTranslations } from 'next-intl/server';

enum TabEnum {
  Dialer = 'dialer',
  Contact = 'contact',
  History = 'history'
}

export default async function CallPageView() {
  const tab = searchParamsCache.get('tab') || TabEnum.Dialer;
  const t = await getTranslations('navigation.tabs');

  return (
    <Tabs defaultValue={tab} key={tab}>
      <TabsList className='w-fit'>
        <TabsTrigger value={TabEnum.Dialer} asChild>
          <Link href={`?tab=${TabEnum.Dialer}`}>{t('dialer')}</Link>
        </TabsTrigger>
        <TabsTrigger value={TabEnum.Contact} asChild>
          <Link href={`?tab=${TabEnum.Contact}`}>{t('contact')}</Link>
        </TabsTrigger>
        <TabsTrigger value={TabEnum.History} asChild>
          <Link href={`?tab=${TabEnum.History}`}>{t('history')}</Link>
        </TabsTrigger>
      </TabsList>

      {tab === TabEnum.Contact && (
        <TabsContent
          value={TabEnum.Contact}
          className='flex flex-1 flex-col space-y-4'
        >
          <Suspense
            fallback={
              <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />
            }
          >
            <ContactListingPage />
          </Suspense>
        </TabsContent>
      )}

      {tab === TabEnum.Dialer && (
        <TabsContent value={TabEnum.Dialer}>
          <Dialer />
        </TabsContent>
      )}

      {tab === TabEnum.History && (
        <TabsContent value={TabEnum.History}>
          <Suspense
            fallback={
              <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />
            }
          >
            <CallHistoryListing />
          </Suspense>
        </TabsContent>
      )}
    </Tabs>
  );
}
