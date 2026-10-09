'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsInteger, useQueryState } from 'nuqs';
import type { ColumnDef } from '@tanstack/react-table';
import { Text } from 'lucide-react';
import { IconEdit, IconListDetails, IconTrash } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { DataTable } from '@ringee/frontend-shared/components/ui/table/data-table';
import { DataTableToolbar } from '@ringee/frontend-shared/components/ui/table/data-table-toolbar';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { useDataTable } from '@ringee/frontend-shared/hooks/use-data-table';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useMemberFilterColumn } from '@/components/use-member-filter-column';
import type { ContactList } from '../types';
import { DeleteListDialog, EditListDialog } from './edit-list-dialog';
import { LocalDate, PersonChip, usePersonName } from './list-bits';
import { NewListButton } from './new-list-button';

type Translate = (key: string) => string;

function listColumns(
  t: Translate,
  options: { showAssignee: boolean }
): ColumnDef<ContactList>[] {
  const columns: ColumnDef<ContactList>[] = [
    {
      id: 'name',
      accessorKey: 'name',
      header: t('table.list'),
      enableSorting: false,
      enableColumnFilter: true,
      meta: {
        label: t('table.list'),
        placeholder: t('table.searchPlaceholder'),
        variant: 'text',
        icon: Text
      },
      cell: ({ row }) => (
        <div className='max-w-[22rem] min-w-[12rem]'>
          <Link
            href={`/dashboard/lists/${row.original.id}`}
            className='font-medium hover:underline'
          >
            {row.original.name}
          </Link>
          {row.original.description ? (
            <p className='text-muted-foreground truncate text-xs'>
              {row.original.description}
            </p>
          ) : null}
        </div>
      )
    },
    {
      id: 'contacts',
      accessorKey: 'contactCount',
      header: t('table.contacts'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {row.original.contactCount.toLocaleString()}
        </span>
      )
    }
  ];

  if (options.showAssignee) {
    columns.push({
      id: 'assignedTo',
      header: t('table.assignedTo'),
      enableSorting: false,
      cell: ({ row }) => (
        <PersonChip person={row.original.assignedTo} className='max-w-48' />
      )
    });
  }

  columns.push(
    {
      id: 'createdBy',
      header: t('table.createdBy'),
      enableSorting: false,
      meta: { className: 'hidden md:table-cell' },
      cell: ({ row }) => <CreatedByCell list={row.original} />
    },
    {
      id: 'actions',
      header: () => <span className='sr-only'>{t('table.actions')}</span>,
      enableSorting: false,
      cell: ({ row }) => <ListRowActions list={row.original} />
    }
  );

  return columns;
}

function CreatedByCell({ list }: { list: ContactList }) {
  const nameOf = usePersonName();
  return (
    <div className='min-w-0 text-sm'>
      <div className='truncate'>{nameOf(list.createdBy)}</div>
      <div className='text-muted-foreground text-xs'>
        <LocalDate value={list.createdAt} />
      </div>
    </div>
  );
}

/** "Open" in sight; editing and deleting, for whoever may, behind the menu. */
function ListRowActions({ list }: { list: ContactList }) {
  const t = useTranslations('lists');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className='flex items-center justify-end gap-1'>
      <Button variant='outline' size='sm' className='h-8' asChild>
        <Link href={`/dashboard/lists/${list.id}`}>{t('table.open')}</Link>
      </Button>
      {list.permissions.canManage ? (
        <>
          <TableRowActions
            label={tCommon('openActions')}
            menuLabel={t('table.actions')}
          >
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <IconEdit className='mr-2 size-4' /> {t('detail.edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant='destructive'
              onClick={() => setDeleting(true)}
            >
              <IconTrash className='mr-2 size-4' /> {t('detail.delete')}
            </DropdownMenuItem>
          </TableRowActions>
          <EditListDialog
            list={list}
            open={editing}
            onOpenChange={setEditing}
          />
          <DeleteListDialog
            list={list}
            open={deleting}
            onOpenChange={setDeleting}
            onDeleted={() => router.refresh()}
          />
        </>
      ) : (
        <span className='size-8 shrink-0' aria-hidden />
      )}
    </div>
  );
}

/** The first-run state: nothing to work through yet, and the way to start. */
function ListsEmptyState() {
  const t = useTranslations('lists.empty');
  const { canAccessAdminFeatures } = useOrgRole();

  return (
    <div className='flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center'>
      <IconListDetails className='text-muted-foreground mb-4 size-10' />
      <h3 className='text-lg font-semibold'>{t('title')}</h3>
      <p className='text-muted-foreground mt-1 max-w-sm text-sm'>
        {canAccessAdminFeatures
          ? t('adminDescription')
          : t('memberDescription')}
      </p>
      <NewListButton className='mt-5' />
    </div>
  );
}

export function ContactListsTable({
  data,
  totalItems,
  filtered
}: {
  data: ContactList[];
  totalItems: number;
  /** A search or member filter is applied, so "none" means "no match". */
  filtered: boolean;
}) {
  const t = useTranslations('lists');
  const { hasOrg } = useOrgRole();
  const [pageSize] = useQueryState('perPage', parseAsInteger.withDefault(10));

  const columns = useMemo(
    () => listColumns(t, { showAssignee: hasOrg }),
    [t, hasOrg]
  );
  // Admin-only "Member" filter: narrows to the lists one person works.
  const { column: memberColumn } = useMemberFilterColumn<ContactList>();
  const tableColumns = useMemo(
    () => (memberColumn ? [...columns, memberColumn] : columns),
    [columns, memberColumn]
  );

  const { table } = useDataTable({
    data,
    columns: tableColumns,
    pageCount: Math.ceil(totalItems / pageSize),
    shallow: false,
    debounceMs: 500,
    initialState: {
      columnVisibility: { memberId: false },
      columnPinning: { right: ['actions'] }
    }
  });

  if (totalItems === 0 && !filtered) return <ListsEmptyState />;

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}
