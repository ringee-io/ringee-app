import { notFound } from 'next/navigation';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import ContactForm from './contact.form';

type TProductViewPageProps = {
  contactId: string;
};

export default async function ContactViewPage({
  contactId
}: TProductViewPageProps) {
  let contact = null;
  let pageTitle = 'Create New Contact';

  if (contactId !== 'new') {
    const data = await apiServer.get(`/contacts/${contactId}`);
    contact = data;

    if (!contact) {
      notFound();
    }

    pageTitle = `Edit Contact`;
  }

  return <ContactForm initialData={contact} pageTitle={pageTitle} />;
}
