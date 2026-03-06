import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { CallTable } from './call.history.tables';
import { columns } from './call.history.tables/columns';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { serialize } from '@ringee/frontend-shared/lib/searchparams';

type CallListingPage = {};

export default async function CallListingPage({}: CallListingPage) {
  const page = searchParamsCache.get('page');
  const search = searchParamsCache.get('name');
  const pageLimit = searchParamsCache.get('perPage');

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search })
  };

  const data = await apiServer.get(`/telephony/calls${serialize(filters)}`);

  const totalCalls = data.total;
  const calls: any[] = data.data;

  return <CallTable data={calls} totalItems={totalCalls} columns={columns} />;
}
