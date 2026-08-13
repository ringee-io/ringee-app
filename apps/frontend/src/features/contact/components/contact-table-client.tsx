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
  const columns = useMemo(() => getContactColumns(t), [t]);

  return <ContactTable data={data} totalItems={totalItems} columns={columns} />;
}
