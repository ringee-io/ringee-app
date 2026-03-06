import FormCardSkeleton from '@ringee/frontend-shared/components/form-card-skeleton';
import PageContainer from '@/components/layout/page-container';
import { Suspense } from 'react';
import ContactViewPage from '@/features/contact/components/product.view.page';

export const metadata = {
  title: 'Contact — Create or Edit | Ringee',
  description:
    'Manage your Ringee contacts effortlessly. Add, edit, or view contact details to keep your sales and calling workflow organized and efficient.'
};

type PageProps = { params: Promise<{ contactId: string }> };

export default async function Page(props: PageProps) {
  const params = await props.params;
  return (
    <PageContainer scrollable>
      <div className='flex-1 space-y-4'>
        <Suspense fallback={<FormCardSkeleton />}>
          <ContactViewPage contactId={params.contactId} />
        </Suspense>
      </div>
    </PageContainer>
  );
}
