import { Product } from '@ringee/frontend-shared/constants/data';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { ContactTable } from './contact.tables';
import { columns } from './contact.tables/columns';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { serialize } from '@ringee/frontend-shared/lib/searchparams';
import { unstable_noStore as noStore } from 'next/cache';

type ContactListingPage = {};

export default async function ContactListingPage({}: ContactListingPage) {
  // Prevent caching to ensure fresh data on every request
  noStore();
  
  const page = searchParamsCache.get('page');
  const search = searchParamsCache.get('name');
  const pageLimit = searchParamsCache.get('perPage');
  const sort = searchParamsCache.get('sort');
  const tags = searchParamsCache.get('tags');

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search })
  };
  const sorting = sort?.length
    ? sort.reduce(
        (acc, item) => ({
          ...acc,
          [item.id]: item.desc === true ? 'desc' : 'asc'
        }),
        {}
      )
    : undefined;
  
  // Build base URL with filters
  let apiUrl = `/contacts${serialize(filters)}`;
  
  // Add sorting
  if (sorting) {
    apiUrl += `${apiUrl.includes('?') ? '&' : '?'}sort=${JSON.stringify(sorting)}`;
  }
  
  // Add tags filter (comma-separated)
  if (tags && tags.length > 0) {
    apiUrl += `${apiUrl.includes('?') ? '&' : '?'}tags=${tags.join(',')}`;
  }

  const data = await apiServer.get(apiUrl);

  const totalProducts = data.meta.total;
  const products: Product[] = data.data;

  return (
    <ContactTable
      data={products}
      totalItems={totalProducts}
      columns={columns}
    />
  );
}




