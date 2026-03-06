'use client';

import { Column, ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@ringee/frontend-shared/components/ui/table/data-table-column-header';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@ringee/frontend-shared/lib/utils';

export type NumberPurchased = {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  phoneNumberType?: string;
  status?: string;
  providerConnectionName?: string;
  purchaseDate?: string | null;
  monthlyCost?: number | null;
  upfrontCost?: number | null;
};

export const columns: ColumnDef<NumberPurchased>[] = [
  {
    accessorKey: 'phoneNumber',
    header: ({ column }: { column: Column<NumberPurchased, unknown> }) => (
      <DataTableColumnHeader column={column} title='Phone Number' />
    ),
    cell: ({ cell }) => (
      <span className='text-foreground font-medium'>
        {cell.getValue<string>()}
      </span>
    )
    // enableColumnFilter: true
  },
  {
    accessorKey: 'isoCountry',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Country' />
    ),
    cell: ({ cell }) => (
      <span className='text-muted-foreground uppercase'>
        {cell.getValue<string>()}
      </span>
    )
  },
  {
    accessorKey: 'phoneNumberType',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Type' />
    ),
    cell: ({ cell }) => {
      const val = cell.getValue<string>() || 'N/A';
      return (
        <Badge variant='outline' className='capitalize'>
          {val}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ cell }) => {
      const status = (cell.getValue<string>() || '').toLowerCase()!;

      const values = {
        'assigned': 'default',
        'inactive': 'secondary',
        'pending': 'default'
      } as Record<string, string>

      const variant = values[status] as any

      return <Badge className={cn(
        status == 'pending' && 'bg-orange-500 text-white'
      )} variant={variant}>{status || 'unknown'}</Badge>;
    }
  },
  {
    accessorKey: 'providerConnectionName',
    header: 'Connection',
    cell: ({ cell }) => cell.getValue<string>() || '-'
  },
  {
    accessorKey: 'purchaseDate',
    header: 'Purchase Date',
    cell: ({ cell }) => {
      const date = cell.getValue<string | null>();
      return date ? format(new Date(date), 'dd MMM yyyy') : '-';
    }
  },
  {
    accessorKey: 'monthlyCost',
    header: 'Monthly Cost',
    cell: ({ cell }) => {
      const val = cell.getValue<number | null>();
      return val ? `$${val.toFixed(2)}` : '-';
    }
  },
  {
    accessorKey: 'upfrontCost',
    header: 'Upfront Cost',
    cell: ({ cell }) => {
      const val = cell.getValue<number | null>();
      return val ? `$${val.toFixed(2)}` : '-';
    }
  }
];
