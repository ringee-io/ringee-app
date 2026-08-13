import FormCardSkeleton from '@ringee/frontend-shared/components/form-card-skeleton';
import PageContainer from '@/components/layout/page-container';
import { Suspense } from 'react';
import ContactViewPage from '@/features/contact/components/product.view.page';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('contacts.editPage');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

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
