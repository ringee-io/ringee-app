import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import type { ContactList, ContactListContact, Paged } from '../types';
import { ListContactsTable } from './list-contacts-table';
import { ListDetailHeader } from './list-detail-header';
import { ListsLoadError } from './lists-load-error';

/**
 * One list and a page of its contacts. A list the caller may not see answers
 * 404, exactly like a missing one (LIST-001), and renders as not found.
 */
export default async function ListDetailServer({ listId }: { listId: string }) {
  noStore();

  const search = searchParamsCache.get('name');
  const params = new URLSearchParams({
    page: String(searchParamsCache.get('page')),
    limit: String(searchParamsCache.get('perPage'))
  });
  if (search) params.set('search', search);

  let list: ContactList;
  let contacts: Paged<ContactListContact>;
  try {
    [list, contacts] = await Promise.all([
      apiServer.get<ContactList>(`/contact-lists/${listId}`),
      apiServer.get<Paged<ContactListContact>>(
        `/contact-lists/${listId}/contacts?${params.toString()}`
      )
    ]);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    // 400 is a malformed id in the URL.
    if (status === 404 || status === 400) notFound();
    return <ListsLoadError />;
  }

  return (
    <div className='flex flex-1 flex-col space-y-4'>
      <ListDetailHeader list={list} />
      <Separator />
      <ListContactsTable
        list={list}
        data={contacts.data}
        totalItems={contacts.meta.total}
        searching={!!search}
      />
    </div>
  );
}
