import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import ContactListingPage from '@/features/contact/components/contact.listing';
import { ContactPageActions } from '@/features/contact/components/contact-page-actions';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';

export const metadata = {
  title: 'Contacts — Manage Contacts | Ringee',
  description: 'View, search, and manage all your contacts in one place.'
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function ContactsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <div className='flex flex-1 flex-col space-y-4'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <Heading title='Contacts' description='Manage your contacts' />
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
  );
}
