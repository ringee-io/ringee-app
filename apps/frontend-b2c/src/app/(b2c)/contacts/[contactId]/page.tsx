import FormCardSkeleton from '@ringee/frontend-shared/components/form-card-skeleton';
import { Suspense } from 'react';
import ContactViewPage from '@/features/contact/components/contact.view.page';

export const metadata = {
  title: 'Contact — Create or Edit | Ringee',
  description:
    'Manage your Ringee contacts effortlessly. Add, edit, or view contact details.'
};

type PageProps = { params: Promise<{ contactId: string }> };

export default async function Page(props: PageProps) {
  const params = await props.params;
  return (
    <div className='flex flex-1 flex-col space-y-4'>
      <Suspense fallback={<FormCardSkeleton />}>
        <ContactViewPage contactId={params.contactId} />
      </Suspense>
    </div>
  );
}
