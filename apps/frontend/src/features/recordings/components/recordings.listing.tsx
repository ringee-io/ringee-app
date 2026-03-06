import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { RecordingsTable } from './recordings.tables';
import { columns } from './recordings.tables/columns';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';

type RecordingsListingProps = {};

export default async function RecordingsListing({ }: RecordingsListingProps) {
    const page = searchParamsCache.get('page');
    const pageLimit = searchParamsCache.get('perPage');
    const dateFrom = searchParamsCache.get('dateFrom');
    const dateTo = searchParamsCache.get('dateTo');

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(pageLimit));
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const data = await apiServer.get(`/recordings?${params.toString()}`);

    const totalRecordings = data.total ?? 0;
    const recordings = data.data ?? [];

    return (
        <RecordingsTable
            data={recordings}
            totalItems={totalRecordings}
            columns={columns}
        />
    );
}
