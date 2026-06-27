'use client';

import { Column, ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@ringee/frontend-shared/components/ui/table/data-table-column-header';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useTranslations } from 'next-intl';
import { VerifyNumberCell } from './verify.number.cell';

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
  inboundMode?: 'ringee_default' | 'desk_phone_only';
};

export const columns: ColumnDef<NumberPurchased>[] = [
  {
    accessorKey: 'phoneNumber',
    header: ({ column }: { column: Column<NumberPurchased, unknown> }) => {
      const t = useTranslations('settings.numbers.my.table');
      return <DataTableColumnHeader column={column} title={t('phoneNumber')} />;
    },
    cell: ({ cell }) => (
      <span className='text-foreground font-medium'>
        {cell.getValue<string>()}
      </span>
    )
  },
  {
    accessorKey: 'isoCountry',
    header: ({ column }) => {
      const t = useTranslations('settings.numbers.my.table');
      return <DataTableColumnHeader column={column} title={t('country')} />;
    },
    cell: ({ cell }) => (
      <span className='text-muted-foreground uppercase'>
        {cell.getValue<string>()}
      </span>
    )
  },
  {
    accessorKey: 'phoneNumberType',
    header: ({ column }) => {
      const t = useTranslations('settings.numbers.my.table');
      return <DataTableColumnHeader column={column} title={t('type')} />;
    },
    cell: ({ cell }) => {
      const t = useTranslations('settings.numbers.my.table');
      const val = cell.getValue<string>() || t('na');
      return (
        <Badge variant='outline' className='capitalize'>
          {val}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'status',
    header: ({ column }) => {
      const t = useTranslations('settings.numbers.my.table');
      return <DataTableColumnHeader column={column} title={t('status')} />;
    },
    cell: ({ cell }) => {
      const tTable = useTranslations('settings.numbers.my.table');
      const tStatus = useTranslations('settings.numbers.my.status');
      const status = (cell.getValue<string>() || '').toLowerCase()!;

      const variants: Record<string, string> = {
        assigned: 'default',
        inactive: 'secondary',
        pending: 'default',
        rejected: 'destructive',
        expired: 'destructive'
      };

      const variant = variants[status] as any;
      const knownStatuses = [
        'assigned',
        'inactive',
        'pending',
        'rejected',
        'expired'
      ];
      const label = status
        ? knownStatuses.includes(status)
          ? tStatus(status as any)
          : status
        : tTable('unknown');

      return (
        <Badge
          className={cn(
            status == 'pending' && 'bg-orange-500 text-white',
            (status == 'rejected' || status == 'expired') &&
              'bg-red-500 text-white'
          )}
          variant={variant}
        >
          {label}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'inboundMode',
    header: () => <>Inbound destination</>,
    cell: ({ cell }) => {
      const mode = cell.getValue<string>();
      return mode === 'desk_phone_only' ? (
        <Badge variant='secondary'>Desk phone only</Badge>
      ) : (
        <Badge variant='outline'>Ringee Web/Mobile</Badge>
      );
    }
  },
  {
    accessorKey: 'providerConnectionName',
    header: () => {
      const t = useTranslations('settings.numbers.my.table');
      return <>{t('connection')}</>;
    },
    cell: ({ cell }) => cell.getValue<string>() || '-'
  },
  {
    accessorKey: 'purchaseDate',
    header: () => {
      const t = useTranslations('settings.numbers.my.table');
      return <>{t('purchaseDate')}</>;
    },
    cell: ({ cell }) => {
      const date = cell.getValue<string | null>();
      return date ? format(new Date(date), 'dd MMM yyyy') : '-';
    }
  },
  {
    accessorKey: 'monthlyCost',
    header: () => {
      const t = useTranslations('settings.numbers.my.table');
      return <>{t('monthlyCost')}</>;
    },
    cell: ({ cell }) => {
      const val = cell.getValue<number | null>();
      return val ? `$${val.toFixed(2)}` : '-';
    }
  },
  {
    accessorKey: 'upfrontCost',
    header: () => {
      const t = useTranslations('settings.numbers.my.table');
      return <>{t('upfrontCost')}</>;
    },
    cell: ({ cell }) => {
      const val = cell.getValue<number | null>();
      return val ? `$${val.toFixed(2)}` : '-';
    }
  },
  {
    id: 'verify',
    header: () => {
      const t = useTranslations('settings.numbers.my.table');
      return <>{t('actions')}</>;
    },
    cell: ({ row }) => <VerifyNumberCell data={row.original} />
  }
];
