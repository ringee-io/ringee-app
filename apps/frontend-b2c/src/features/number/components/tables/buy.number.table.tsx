'use client';

import { DataTable } from '@ringee/frontend-shared/components/ui/table/data-table';
import { DataTableToolbar } from '@ringee/frontend-shared/components/ui/table/data-table-toolbar';
import { useDataTable } from '@ringee/frontend-shared/hooks/use-data-table';
import { ColumnDef } from '@tanstack/react-table';
import { parseAsInteger, useQueryState } from 'nuqs';

interface TableProps<TData, TValue> {
  data: TData[];
  totalItems: number;
  columns: ColumnDef<TData, TValue>[];
}

export function BuyNumberTable<TData, TValue>({
  data,
  totalItems,
  columns
}: TableProps<TData, TValue>) {
  const [pageSize] = useQueryState('perPage', parseAsInteger.withDefault(50));
  const pageCount = Math.ceil(totalItems / pageSize);

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    shallow: false,
    debounceMs: 500
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}
