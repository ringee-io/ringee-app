import { BarGraph } from '@/features/overview/components/bar-graph';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { dashboardParamsCache } from '@/features/overview/search-params';
import type { SearchParams } from 'nuqs/server';

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function BarStats({ searchParams }: PageProps) {
  await dashboardParamsCache.parse(searchParams);
  const memberId = dashboardParamsCache.get('memberId');
  const data = await apiServer.get('/dashboard/calls-per-day', { memberId });
  return <BarGraph data={data} />;
}
