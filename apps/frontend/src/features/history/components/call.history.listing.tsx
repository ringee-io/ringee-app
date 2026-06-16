import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { CallTable } from './call.history.tables';
import { columns } from './call.history.tables/columns';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';

type CallListingPage = {};

export default async function CallListingPage({}: CallListingPage) {
  const page = searchParamsCache.get('page');
  const search = searchParamsCache.get('name');
  const pageLimit = searchParamsCache.get('perPage');
  const dateFrom = searchParamsCache.get('dateFrom');
  const dateTo = searchParamsCache.get('dateTo');
  const memberId = searchParamsCache.get('memberId');

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(pageLimit));
  if (search) params.set('search', search);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  // Admin member filter — the backend re-applies role scoping (members are
  // always pinned to themselves regardless of this value, freelancers see all
  // their own calls). `/telephony/calls` reads the member id as `userId`.
  if (memberId) params.set('userId', memberId);

  const data = await apiServer.get(`/telephony/calls?${params.toString()}`);

  const totalCalls = data.total;
  const calls: any[] = data.data;

  return <CallTable data={calls} totalItems={totalCalls} columns={columns} />;
}
