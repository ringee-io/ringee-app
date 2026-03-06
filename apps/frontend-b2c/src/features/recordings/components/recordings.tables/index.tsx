'use client';

import { DataTable } from '@ringee/frontend-shared/components/ui/table/data-table';
import { DataTableViewOptions } from '@ringee/frontend-shared/components/ui/table/data-table-view-options';
import { useDataTable } from '@ringee/frontend-shared/hooks/use-data-table';
import { ColumnDef } from '@tanstack/react-table';
import { parseAsInteger, useQueryState } from 'nuqs';
import { RecordingsDateFilter } from '../recordings-date-filter';

interface RecordingsTableParams<TData, TValue> {
    data: TData[];
    totalItems: number;
    columns: ColumnDef<TData, TValue>[];
}

export function RecordingsTable<TData, TValue>({
    data,
    totalItems,
    columns
}: RecordingsTableParams<TData, TValue>) {
    const [pageSize] = useQueryState('perPage', parseAsInteger.withDefault(10));

    const pageCount = Math.ceil(totalItems / pageSize);

    const { table } = useDataTable({
        data,
        columns,
        pageCount: pageCount,
        shallow: false,
        debounceMs: 500
    });

    return (
        <DataTable table={table}>
            <div className="flex w-full items-center justify-between gap-2 p-1">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <RecordingsDateFilter />
                </div>
                <div className="flex items-center gap-2">
                    <DataTableViewOptions table={table} />
                </div>
            </div>
        </DataTable>
    );
}
