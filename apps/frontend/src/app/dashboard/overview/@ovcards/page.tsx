import type { SearchParams } from 'nuqs/server';
import { OverviewCards } from '@/features/overview/components/overview.cards';
import { dashboardParamsCache } from '@/features/overview/search-params';

export default async function OvCards({ searchParams }: { searchParams: Promise<SearchParams> }) {
    console.log('Rendering @ovcards/page');
    await dashboardParamsCache.parse(searchParams);
    const memberId = dashboardParamsCache.get('memberId');

    return (
        <OverviewCards memberId={memberId ?? undefined} />
    )
}