import { AreaGraph } from '@/features/overview/components/area-graph';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { dashboardParamsCache } from '@/features/overview/search-params';
import type { SearchParams } from 'nuqs/server';

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function AreaStats({ searchParams }: PageProps) {
  await dashboardParamsCache.parse(searchParams);
  const memberId = dashboardParamsCache.get('memberId');
  const data = await apiServer.get('/dashboard/calls-per-month', { memberId });
  const { growthRate } = await apiServer.get('/dashboard/overview', { memberId });

  return <AreaGraph data={data} growthRate={growthRate} />;
}
