import { notFound } from 'next/navigation';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import ContactForm from './contact.form';
import { getTranslations } from 'next-intl/server';

type TProductViewPageProps = {
  contactId: string;
};

export default async function ContactViewPage({
  contactId
}: TProductViewPageProps) {
  let contact = null;
  const t = await getTranslations('contacts.formPage');
  let pageTitle = t('create');

  if (contactId !== 'new') {
    const data = await apiServer.get(`/contacts/${contactId}`);
    contact = data;

    if (!contact) {
      notFound();
    }

    pageTitle = t('edit');
  }

  return <ContactForm initialData={contact} pageTitle={pageTitle} />;
}
