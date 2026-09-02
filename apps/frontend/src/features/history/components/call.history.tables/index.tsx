'use client';

import * as React from 'react';
import { DataTable } from '@ringee/frontend-shared/components/ui/table/data-table';
import { DataTableViewOptions } from '@ringee/frontend-shared/components/ui/table/data-table-view-options';
import { DataTableFacetedFilter } from '@ringee/frontend-shared/components/ui/table/data-table-faceted-filter';
import { useDataTable } from '@ringee/frontend-shared/hooks/use-data-table';
import { ColumnDef } from '@tanstack/react-table';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useTranslations } from 'next-intl';
import { DateRangeFilter } from '@/components/date-range-filter';
import { useMemberFilterColumn } from '@/components/use-member-filter-column';

interface CallTableParams<TData, TValue> {
  data: TData[];
  totalItems: number;
  columns: ColumnDef<TData, TValue>[];
}
export function CallTable<TData, TValue>({
  data,
  totalItems,
  columns
}: CallTableParams<TData, TValue>) {
  const [pageSize] = useQueryState('perPage', parseAsInteger.withDefault(10));
  const t = useTranslations('common.memberFilter');

  const pageCount = Math.ceil(totalItems / pageSize);

  // Admin-only "Member" faceted filter (hidden filter-only column). Members and
  // freelancers don't get the column; the date filter below is for everyone.
  const { column: memberColumn, options: memberOptions } =
    useMemberFilterColumn<TData>();
  const tableColumns = React.useMemo(
    () =>
      memberColumn
        ? [...columns, memberColumn as ColumnDef<TData, TValue>]
        : columns,
    [columns, memberColumn]
  );

  const { table } = useDataTable({
    data,
    columns: tableColumns,
    pageCount: pageCount,
    shallow: false,
    debounceMs: 500,
    initialState: {
      columnVisibility: { memberId: false },
      columnPinning: { right: ['actions'] }
    }
  });

  const memberTableColumn = memberColumn
    ? table.getColumn('memberId')
    : undefined;

  return (
    <DataTable table={table}>
      <div className='flex w-full items-center justify-between gap-2 p-1'>
        <div className='flex flex-1 flex-wrap items-center gap-2'>
          <DateRangeFilter />
          {memberTableColumn && (
            <DataTableFacetedFilter
              column={memberTableColumn}
              title={t('member')}
              options={memberOptions}
            />
          )}
        </div>
        <div className='flex items-center gap-2'>
          <DataTableViewOptions table={table} />
        </div>
      </div>
    </DataTable>
  );
}
