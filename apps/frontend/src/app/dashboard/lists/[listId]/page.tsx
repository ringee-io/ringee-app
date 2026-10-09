import PageContainer from '@/components/layout/page-container';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import ListDetailServer from '@/features/lists/components/list-detail.server';
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
  params: Promise<{ listId: string }>;
  searchParams: Promise<SearchParams>;
};

export default async function Page(props: PageProps) {
  const [{ listId }, searchParams] = await Promise.all([
    props.params,
    props.searchParams
  ]);
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer scrollable>
      <Suspense
        fallback={
          <DataTableSkeleton columnCount={5} rowCount={8} filterCount={1} />
        }
      >
        <ListDetailServer listId={listId} />
      </Suspense>
    </PageContainer>
  );
}
