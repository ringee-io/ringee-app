'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsInteger, useQueryState } from 'nuqs';
import type { ColumnDef } from '@tanstack/react-table';
import { Text } from 'lucide-react';
import {
  IconExternalLink,
  IconLoader2,
  IconPhone,
  IconTrash,
  IconUsers
} from '@tabler/icons-react';
import { toast } from 'sonner';
import {
  Avatar,
  AvatarFallback
} from '@ringee/frontend-shared/components/ui/avatar';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { DataTable } from '@ringee/frontend-shared/components/ui/table/data-table';
import { DataTableToolbar } from '@ringee/frontend-shared/components/ui/table/data-table-toolbar';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDataTable } from '@ringee/frontend-shared/hooks/use-data-table';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import { useDial } from '@/features/calls/hooks/use.dial';
import { getInitials } from '@/features/calls/lib/initials';
import type { ContactList, ContactListContact } from '../types';
import { LocalDate } from './list-bits';

type Translate = (key: string) => string;

function contactColumns(
  t: Translate,
  list: ContactList
): ColumnDef<ContactListContact>[] {
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: t('contacts.name'),
      enableSorting: false,
      enableColumnFilter: true,
      meta: {
        label: t('contacts.name'),
        placeholder: t('contacts.searchPlaceholder'),
        variant: 'text',
        icon: Text
      },
      cell: ({ row }) => <ContactCell contact={row.original} />
    },
    {
      id: 'phone',
      accessorKey: 'phoneNumber',
      header: t('contacts.phone'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='text-muted-foreground font-mono text-sm whitespace-nowrap'>
          {row.original.phoneNumber}
        </span>
      )
    },
    {
      id: 'lastCall',
      header: t('contacts.lastCall'),
      enableSorting: false,
      meta: { className: 'hidden md:table-cell' },
      cell: ({ row }) =>
        row.original.lastCallAt ? (
          <span className='text-sm whitespace-nowrap'>
            <LocalDate value={row.original.lastCallAt} format='dateTime' />
          </span>
        ) : (
          <span className='text-muted-foreground text-sm'>
            {t('contacts.never')}
          </span>
        )
    },
    {
      id: 'added',
      header: t('contacts.added'),
      enableSorting: false,
      meta: { className: 'hidden lg:table-cell' },
      cell: ({ row }) => (
        <span className='text-muted-foreground text-sm whitespace-nowrap'>
          <LocalDate value={row.original.addedAt} />
        </span>
      )
    },
    {
      id: 'actions',
      header: () => <span className='sr-only'>{t('table.actions')}</span>,
      enableSorting: false,
      cell: ({ row }) => <ContactActions list={list} contact={row.original} />
    }
  ];
}

function useContactName() {
  const t = useTranslations('lists.contacts');
  return (contact: ContactListContact) => contact.name?.trim() || t('unnamed');
}

function ContactCell({ contact }: { contact: ContactListContact }) {
  const t = useTranslations('lists.contacts');
  const nameOf = useContactName();
  const detail = [contact.company, contact.jobTitle]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='flex min-w-[12rem] items-center gap-3'>
      <Avatar className='size-9 shrink-0'>
        <AvatarFallback className='text-xs font-semibold'>
          {getInitials(contact.name, contact.phoneNumber)}
        </AvatarFallback>
      </Avatar>
      <div className='min-w-0'>
        <div className='flex min-w-0 items-center gap-2'>
          <Link
            href={`/dashboard/contact/${contact.id}`}
            className='truncate font-medium hover:underline'
          >
            {nameOf(contact)}
          </Link>
          {contact.doNotCall ? (
            <span className='inline-flex h-5 shrink-0 items-center rounded-full bg-red-100 px-2 text-[11px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300'>
              {t('doNotCall')}
            </span>
          ) : null}
        </div>
        {detail ? (
          <div className='text-muted-foreground max-w-64 truncate text-xs'>
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Call, always in sight; the rest behind the menu. */
function ContactActions({
  list,
  contact
}: {
  list: ContactList;
  contact: ContactListContact;
}) {
  const t = useTranslations('lists.contacts');
  const tCommon = useTranslations('common');
  const api = useApi();
  const router = useRouter();
  const { dial, dialingNumber, busy } = useDial();
  const [removing, setRemoving] = useState(false);
  const name = useContactName()(contact);
  const dialing = dialingNumber === contact.phoneNumber;

  const remove = async () => {
    setRemoving(true);
    try {
      await api.delete(`/contact-lists/${list.id}/contacts/${contact.id}`);
      toast.success(t('removed', { name }));
      router.refresh();
    } catch (error) {
      toast.error(describeApiError(error, t('removeFailed')));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className='flex items-center justify-end gap-1'>
      <Button
        variant='outline'
        size='sm'
        className='h-8 gap-1.5'
        disabled={busy}
        onClick={() => void dial(contact.phoneNumber)}
        aria-label={t('callName', { name })}
      >
        {dialing ? (
          <IconLoader2 className='size-4 animate-spin' />
        ) : (
          <IconPhone className='size-4' />
        )}
        <span className='hidden sm:inline'>{t('call')}</span>
      </Button>
      <TableRowActions
        label={t('more', { name })}
        menuLabel={tCommon('actions')}
      >
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/contact/${contact.id}`}>
            <IconExternalLink className='mr-2 size-4' /> {t('viewContact')}
          </Link>
        </DropdownMenuItem>
        {list.permissions.canManage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant='destructive'
              disabled={removing}
              onClick={() => void remove()}
            >
              <IconTrash className='mr-2 size-4' /> {t('remove')}
            </DropdownMenuItem>
          </>
        ) : null}
      </TableRowActions>
    </div>
  );
}

function EmptyListState({ list }: { list: ContactList }) {
  const t = useTranslations('lists.contacts');
  return (
    <div className='flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center'>
      <IconUsers className='text-muted-foreground mb-4 size-10' />
      <h3 className='text-lg font-semibold'>{t('emptyTitle')}</h3>
      <p className='text-muted-foreground mt-1 max-w-sm text-sm'>
        {list.permissions.canAddContacts
          ? t('emptyDescription')
          : t('emptyReadOnly')}
      </p>
    </div>
  );
}

/** A list's contacts, in the order it is worked in, each callable in place. */
export function ListContactsTable({
  list,
  data,
  totalItems,
  searching
}: {
  list: ContactList;
  data: ContactListContact[];
  totalItems: number;
  searching: boolean;
}) {
  const t = useTranslations('lists');
  const [pageSize] = useQueryState('perPage', parseAsInteger.withDefault(10));
  const columns = useMemo(() => contactColumns(t, list), [t, list]);

  const { table } = useDataTable({
    data,
    columns,
    pageCount: Math.ceil(totalItems / pageSize),
    shallow: false,
    debounceMs: 500,
    initialState: { columnPinning: { right: ['actions'] } }
  });

  if (totalItems === 0 && !searching) return <EmptyListState list={list} />;

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}
