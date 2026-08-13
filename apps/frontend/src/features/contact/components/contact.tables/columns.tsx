'use client';

import { DataTableColumnHeader } from '@ringee/frontend-shared/components/ui/table/data-table-column-header';
import { Column, ColumnDef } from '@tanstack/react-table';
import { PhoneCall, Text } from 'lucide-react';
import { CellAction } from './cell-action';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useDialerStore } from '@/features/calls/store/dialer.store';

interface ContactTag {
  tag: {
    id: string;
    name: string;
    color?: string | null;
  };
}

export interface ContactRow {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber: string;
  company?: string | null;
  jobTitle?: string | null;
  locationRegion?: string | null;
  websiteUrl?: string | null;
  revenue?: string | null;
  companySize?: string | null;
  source?: string | null;
  lastCallAt?: string | null;
  tags?: ContactTag[];
  notes?: { content: string }[];
}

export const getContactColumns = (
  t: (key: string) => string
): ColumnDef<ContactRow>[] => [
  {
    id: 'name',
    accessorKey: 'name',
    header: ({ column }: { column: Column<ContactRow, unknown> }) => (
      <DataTableColumnHeader column={column} title={t('name')} />
    ),
    cell: ({ row }) => {
      const contact = row.original;
      const displayName =
        contact.name ||
        [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
        t('unknown');
      const initial = displayName.charAt(0)?.toUpperCase() || '?';
      const router = useRouter();

      return (
        <button
          className='flex cursor-pointer items-center gap-2 text-left hover:underline'
          onClick={() => router.push(`/dashboard/contact/${contact.id}`)}
        >
          <div className='flex items-center justify-center'>
            <div className='bg-primary flex h-10 w-10 items-center justify-center rounded-full font-semibold text-white'>
              {initial}
            </div>
          </div>
          <div>
            <div className='font-medium'>{displayName}</div>
            {contact.jobTitle && (
              <div className='text-muted-foreground text-xs'>
                {contact.jobTitle}
              </div>
            )}
          </div>
        </button>
      );
    },
    meta: {
      label: t('name'),
      placeholder: t('searchPlaceholder'),
      variant: 'text',
      icon: Text
    },
    enableColumnFilter: true
  },
  {
    id: 'organization',
    accessorFn: (row: ContactRow) => row.company,
    header: ({ column }: { column: Column<ContactRow, unknown> }) => (
      <DataTableColumnHeader column={column} title={t('company')} />
    ),
    cell: ({ row }) => (
      <div>
        <div>{row.original.company || '--'}</div>
        <div className='text-muted-foreground max-w-64 truncate text-xs'>
          {[
            row.original.locationRegion,
            row.original.companySize,
            row.original.revenue,
            row.original.websiteUrl
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    ),
    meta: { className: 'hidden md:table-cell' }
  },
  {
    accessorKey: 'email',
    header: t('email'),
    meta: { className: 'hidden lg:table-cell' }
  },
  {
    accessorKey: 'source',
    header: t('source'),
    meta: { className: 'hidden xl:table-cell' },
    cell: ({ cell }) => {
      const source = cell.getValue<string | null>();
      if (!source)
        return <span className='text-muted-foreground text-xs'>--</span>;
      return (
        <Badge variant='outline' className='text-xs font-normal'>
          {source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'tags',
    header: t('tags'),
    cell: ({ cell }) => {
      const tags = (cell.getValue() as ContactTag[]) || [];

      if (tags.length === 0) {
        return <span className='text-muted-foreground text-xs'>--</span>;
      }

      return (
        <div className='flex flex-wrap gap-1'>
          {tags.slice(0, 3).map(({ tag }) => (
            <Badge
              key={tag.id}
              variant='secondary'
              className='text-xs'
              style={{
                backgroundColor: `${tag.color || '#3B82F6'}20`,
                color: tag.color || '#3B82F6',
                borderColor: `${tag.color || '#3B82F6'}40`
              }}
            >
              {tag.name}
            </Badge>
          ))}
          {tags.length > 3 && (
            <Badge variant='secondary' className='text-xs'>
              +{tags.length - 3}
            </Badge>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: 'phoneNumber',
    header: t('call'),
    cell: ({ cell }) => {
      const phoneNumber = cell.getValue<string>();
      const router = useRouter();
      const dialer = useDialerStore();

      return (
        <div>
          <Button
            variant='secondary'
            size='sm'
            className='cursor-pointer gap-1'
            onClick={() =>
              dialer.quickDialState === 'open'
                ? dialer.setNumber(phoneNumber)
                : router.push(`/dashboard/call?phoneNumber=${phoneNumber}`)
            }
          >
            <PhoneCall className='h-4 w-4' />
            <span className='hidden sm:inline'>{phoneNumber}</span>
            <span className='sm:hidden'>{t('call')}</span>
          </Button>
        </div>
      );
    }
  },
  {
    accessorKey: 'actions',
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original as any} />
  }
];
