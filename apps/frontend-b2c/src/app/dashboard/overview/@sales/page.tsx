import { RecentSales } from '@/features/overview/components/recent-sales';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { dashboardParamsCache } from '@/features/overview/search-params';
import type { SearchParams } from 'nuqs/server';

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function Sales({ searchParams }: PageProps) {
  await dashboardParamsCache.parse(searchParams);
  const memberId = dashboardParamsCache.get('memberId');
  const data = await apiServer.get('/dashboard/recent-calls', { memberId });

  return <RecentSales data={data} />;
}
