'use client';

import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import ContactForm from './contact.form';

type TProductViewPageProps = {
  contactId: string;
};

export default function ContactViewPage({ contactId }: TProductViewPageProps) {
  const api = useApi();
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isNew = contactId === 'new';

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }

    api
      .get(`/contacts/${contactId}`)
      .then((data) => setContact(data))
      .catch(() => notFound())
      .finally(() => setLoading(false));
  }, [contactId, isNew, api]);

  if (loading) {
    return <div className='animate-pulse'>Loading...</div>;
  }

  const pageTitle = isNew ? 'Create New Contact' : 'Edit Contact';

  return <ContactForm initialData={contact} pageTitle={pageTitle} />;
}
