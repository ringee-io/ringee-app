'use client';

import { DataTableColumnHeader } from '@ringee/frontend-shared/components/ui/table/data-table-column-header';
import { Product } from '@ringee/frontend-shared/constants/data';
import { Column, ColumnDef } from '@tanstack/react-table';
import { PhoneCall, Text } from 'lucide-react';
import { CellAction } from './cell-action';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';

interface ContactTag {
  tag: {
    id: string;
    name: string;
    color?: string | null;
  };
}

export const columns: ColumnDef<Product>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: ({ column }: { column: Column<Product, unknown> }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    cell: ({ cell }) => {
      const name = cell.getValue<string>() || '';
      const initial = name.charAt(0)?.toUpperCase() || '';

      return (
        <div className='flex items-center gap-2'>
          <div className='flex items-center justify-center'>
            <div
              className={`bg-primary flex h-10 w-10 items-center justify-center rounded-full font-semibold text-white`}
            >
              {initial}
            </div>
          </div>

          <div>{name}</div>
        </div>
      );
    },
    meta: {
      label: 'Name',
      placeholder: 'Search contacts...',
      variant: 'text',
      icon: Text
    },
    enableColumnFilter: true
  },
  {
    id: 'organization',
    accessorFn: (row: any) => row.company || row.organization,
    header: ({ column }: { column: Column<Product, unknown> }) => (
      <DataTableColumnHeader column={column} title='Organization' />
    ),
    meta: { className: 'hidden md:table-cell' }
  },
  {
    accessorKey: 'email',
    header: 'EMAIL',
    meta: { className: 'hidden lg:table-cell' }
  },
  {
    accessorKey: 'tags',
    header: 'TAGS',
    cell: ({ cell }) => {
      const tags = (cell.getValue() as ContactTag[]) || [];

      if (tags.length === 0) {
        return <span className='text-muted-foreground text-xs'>—</span>;
      }

      return (
        <div className='flex flex-wrap gap-1'>
          {tags.map(({ tag }) => (
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
        </div>
      );
    }
  },
  {
    accessorKey: 'phoneNumber',
    header: 'CALL',
    cell: ({ cell }) => {
      const phoneNumber = cell.getValue<string>();
      const { handleRecall } = useQuickDialerCall()

      return (
        <div>
          <Button
            variant='secondary'
            size='sm'
            className='cursor-pointer gap-1'
            onClick={() => handleRecall(phoneNumber)}
          >
            <PhoneCall className='h-4 w-4' />
            <span className='hidden sm:inline'>{phoneNumber}</span>
            <span className='sm:hidden'>Call</span>
          </Button>
        </div>
      );
    }
  },
  {
    accessorKey: 'notes',
    header: 'NOTES',
    meta: { className: 'hidden xl:table-cell' },
    cell: ({ cell }) => {
      const notes = (cell.getValue() as Array<{ content: string }>) || [];

      return (
        <div className='flex flex-col gap-2'>
          {notes.map((note, index) => {
            const dotdotdot = note.content.length > 40;

            return (
              <div key={index} className='text-muted-foreground text-xs'>
                {' '}
                {index + 1}.{' '}
                {dotdotdot ? note.content.slice(0, 40) + '...' : note.content}
              </div>
            );
          })}
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
