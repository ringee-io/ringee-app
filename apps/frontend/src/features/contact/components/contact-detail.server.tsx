import { notFound } from 'next/navigation';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import ContactDetail from './contact-detail';

export default async function ContactDetailServer({
  contactId
}: {
  contactId: string;
}) {
  const contact = await apiServer.get(`/contacts/${contactId}`);

  if (!contact) {
    notFound();
  }

  return <ContactDetail contact={contact} />;
}
