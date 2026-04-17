import FormCardSkeleton from '@ringee/frontend-shared/components/form-card-skeleton';
import PageContainer from '@/components/layout/page-container';
import { Suspense } from 'react';
import ContactViewPage from '@/features/contact/components/product.view.page';
import ContactDetailServer from '@/features/contact/components/contact-detail.server';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';

export const metadata = {
  title: 'Contact — Details | Ringee',
  description:
    'View full contact details including call history, notes, tags, and more.'
};

type PageProps = { params: Promise<{ contactId: string }> };

export default async function Page(props: PageProps) {
  const params = await props.params;

  if (params.contactId === 'new') {
    return (
      <PageContainer scrollable>
        <div className='flex-1 space-y-4'>
          <Suspense fallback={<FormCardSkeleton />}>
            <ContactViewPage contactId='new' />
          </Suspense>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer scrollable>
      <div className='flex-1 space-y-4'>
        <Suspense
          fallback={
            <DataTableSkeleton columnCount={3} rowCount={5} filterCount={0} />
          }
        >
          <ContactDetailServer contactId={params.contactId} />
        </Suspense>
      </div>
    </PageContainer>
  );
}
