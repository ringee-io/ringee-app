'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ContactTable } from './contact.tables';
import { getContactColumns, type ContactRow } from './contact.tables/columns';

interface ContactTableClientProps {
  data: ContactRow[];
  totalItems: number;
}

export function ContactTableClient({
  data,
  totalItems
}: ContactTableClientProps) {
  const t = useTranslations('contacts.table');
  const tHeaders = useTranslations('tables.headers');
  const columns = useMemo(
    () => getContactColumns(t, tHeaders('actions')),
    [t, tHeaders]
  );

  return <ContactTable data={data} totalItems={totalItems} columns={columns} />;
}
