import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DataTableSkeleton } from '@ringee/frontend-shared/components/ui/table/data-table-skeleton';
import RecordingsListing from '@/features/recordings/components/recordings.listing';
import { Suspense } from 'react';
import { SearchParams } from 'nuqs/server';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('calls.recordings');
    return {
        title: t('metaTitle'),
        description: t('metaDescription')
    };
}

export default async function RecordingsPage({
    searchParams
}: {
    searchParams: Promise<SearchParams>;
}) {
    const searchParamss = await searchParams;
    searchParamsCache.parse(searchParamss);
    const t = await getTranslations('calls.recordings');

    return (
        <PageContainer scrollable={true}>
            <div className="flex flex-1 flex-col space-y-4">
                <div className="flex items-start justify-between">
                    <Heading
                        title={t('title')}
                        description={t('description')}
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
