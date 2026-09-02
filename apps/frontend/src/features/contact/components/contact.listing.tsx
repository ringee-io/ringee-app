import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { ContactTableClient } from './contact-table-client';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { unstable_noStore as noStore } from 'next/cache';

export default async function ContactListingPage() {
  noStore();

  const page = searchParamsCache.get('page');
  const search = searchParamsCache.get('name');
  const pageLimit = searchParamsCache.get('perPage');
  const sort = searchParamsCache.get('sort');
  const tags = searchParamsCache.get('tags');

  const sorting = sort?.length
    ? sort.reduce(
        (acc, item) => ({
          ...acc,
          [item.id]: item.desc === true ? 'desc' : 'asc'
        }),
        {}
      )
    : undefined;

  // The dashboard URL calls this value `perPage`, while the contacts API calls
  // it `limit`. Passing `limit` through the shared dashboard serializer silently
  // dropped it because that serializer only owns dashboard query keys, leaving
  // the API on its default of 10 regardless of the selected page size.
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageLimit)
  });
  if (search) params.set('search', search);
  if (sorting) params.set('sort', JSON.stringify(sorting));
  if (tags.length > 0) params.set('tags', tags.join(','));

  const data = await apiServer.get(`/contacts?${params.toString()}`);

  const totalContacts = data.meta.total;
  const contacts = data.data;

  return <ContactTableClient data={contacts} totalItems={totalContacts} />;
}
