import { unstable_noStore as noStore } from 'next/cache';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import type { ContactList, Paged } from '../types';
import { ContactListsTable } from './contact-lists-table';
import { ListsLoadError } from './lists-load-error';

/** The lists the caller works with — the server decides which (LIST-001). */
export default async function ContactListsListing() {
  noStore();

  const search = searchParamsCache.get('name');
  const memberId = searchParamsCache.get('memberId');
  const params = new URLSearchParams({
    page: String(searchParamsCache.get('page')),
    limit: String(searchParamsCache.get('perPage'))
  });
  if (search) params.set('search', search);
  // Ignored for a member: they only ever get their own lists.
  if (memberId) params.set('assignedToId', memberId);

  let lists: Paged<ContactList>;
  try {
    lists = await apiServer.get<Paged<ContactList>>(
      `/contact-lists?${params.toString()}`
    );
  } catch {
    return <ListsLoadError />;
  }

  return (
    <ContactListsTable
      data={lists.data}
      totalItems={lists.meta.total}
      filtered={!!search || !!memberId}
    />
  );
}
