import { PieGraph } from '@/features/overview/components/pie-graph';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { dashboardParamsCache } from '@/features/overview/search-params';
import type { SearchParams } from 'nuqs/server';

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function Stats({ searchParams }: PageProps) {
  await dashboardParamsCache.parse(searchParams);
  const memberId = dashboardParamsCache.get('memberId');
  const data = await apiServer.get('/dashboard/calls-by-period', { memberId });

  return (
    <PieGraph
      data={data.data}
      rangeStart={new Date(data.rangeStart)}
      rangeEnd={new Date(data.rangeEnd)}
    />
  );
}
