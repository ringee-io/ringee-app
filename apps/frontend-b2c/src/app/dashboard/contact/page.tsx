import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import ContactListingPage from '@/features/contact/components/contact.listing';
import { ContactPageActions } from '@/features/contact/components/contact-page-actions';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';

export const metadata = {
  title: 'Contacts — Manage and Organize | Ringee',
  description:
    'View, search, and manage all your Ringee contacts in one place. Perfect for sales teams, cold callers, and businesses making calls worldwide.'
};

type pageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function Page(props: pageProps) {
  const searchParams = await props.searchParams;
  // Allow nested RSCs to access the search params (in a type-safe way)
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
          <Heading title='Contacts' description='Manage contacts' />
          <ContactPageActions />
        </div>
        <Separator />
        <Suspense
          fallback={
            <DataTableSkeleton columnCount={5} rowCount={8} filterCount={2} />
          }
        >
          <ContactListingPage />
        </Suspense>
      </div>
    </PageContainer>
  );
}


