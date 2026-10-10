import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import ContactListsListing from '@/features/lists/components/contact-lists-listing';
import { NewListButton } from '@/features/lists/components/new-list-button';
import { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('lists');
  return {
    title: `${t('title')} | Ringee`,
    description: t('description')
  };
}

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function Page(props: PageProps) {
  const searchParams = await props.searchParams;
  // Allow nested RSCs to access the search params (in a type-safe way)
  searchParamsCache.parse(searchParams);

  const t = await getTranslations('lists');

  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
          <Heading title={t('title')} description={t('description')} />
          <NewListButton />
        </div>
        <Separator />
        <Suspense
          fallback={
            <DataTableSkeleton columnCount={5} rowCount={6} filterCount={1} />
          }
        >
          <ContactListsListing />
        </Suspense>
      </div>
    </PageContainer>
  );
}
