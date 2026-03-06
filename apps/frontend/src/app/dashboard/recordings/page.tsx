import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import RecordingsListing from '@/features/recordings/components/recordings.listing';
import { Suspense } from 'react';
import { SearchParams } from 'nuqs/server';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';

export const metadata = {
    title: 'Call Recordings — Listen and Download | Ringee',
    description:
        'Access your encrypted call recordings. Play, download, and manage all audio files securely from your Ringee dashboard.'
};

export default async function RecordingsPage({
    searchParams
}: {
    searchParams: Promise<SearchParams>;
}) {
    const searchParamss = await searchParams;
    searchParamsCache.parse(searchParamss);

    return (
        <PageContainer scrollable={true}>
            <div className="flex flex-1 flex-col space-y-4">
                <div className="flex items-start justify-between">
                    <Heading
                        title="Call Recordings"
                        description="Listen and download your encrypted call recordings"
                    />
                </div>
                <Separator />

                <Suspense
                    fallback={
                        <DataTableSkeleton columnCount={7} rowCount={8} filterCount={2} />
                    }
                >
                    <RecordingsListing />
                </Suspense>
            </div>
        </PageContainer>
    );
}
