'use client';

import { ColumnDef, Column } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@ringee/frontend-shared/components/ui/table/data-table-column-header';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { CellActionBuy } from './buy.number.cell.action';

export interface AvailableNumber {
  phoneNumber: string;
  countryCode: string;
  numberType?: string;
  capabilities?: Capabilities;
  costInformation: CostInformation;
}

export interface Capabilities {
  sms: boolean;
  mms: boolean;
  voice: boolean;
  fax: boolean;
  hdVoice: boolean;
  internationalSms: boolean;
  emergency: boolean;
}

export interface CostInformation {
  currency: 'USD';
  monthlyCost: number;
  upfrontCost: number;
}

const FEATURE_OPTIONS: {
  value: string;
  label: string;
  capabilityKey: keyof Capabilities;
}[] = [
  { value: 'voice', label: 'Voice', capabilityKey: 'voice' },
  { value: 'sms', label: 'SMS', capabilityKey: 'sms' },
  { value: 'mms', label: 'MMS', capabilityKey: 'mms' },
  { value: 'hd_voice', label: 'HD Voice', capabilityKey: 'hdVoice' },
  {
    value: 'international_sms',
    label: 'Intl. SMS',
    capabilityKey: 'internationalSms'
  },
  { value: 'emergency', label: 'Emergency', capabilityKey: 'emergency' },
  { value: 'fax', label: 'Fax', capabilityKey: 'fax' }
];

export const columns: ColumnDef<AvailableNumber>[] = [
  {
    accessorKey: 'phoneNumber',
    header: ({ column }: { column: Column<AvailableNumber, unknown> }) => (
      <DataTableColumnHeader column={column} title='Phone Number' />
    ),
    cell: ({ cell }) => (
      <span className='text-foreground font-medium'>
        {cell.getValue<string>()}
      </span>
    ),
    meta: {
      label: 'Phone Number',
      placeholder: 'Search number...',
      variant: 'text'
    }
  },
  {
    id: 'countryCode',
    accessorKey: 'countryCode',
    header: 'Country',
    cell: ({ cell }) => (
      <span className='text-muted-foreground uppercase'>
        {cell.getValue<string>()}
      </span>
    ),
    meta: {
      label: 'Country',
      placeholder: 'Select Country',
      variant: 'select',
      options: [
        { label: '🇺🇸 United States', value: 'US' },
        { label: '🇨🇦 Canada', value: 'CA' },
        { label: '🇪🇸 Spain', value: 'ES' },
        { label: '🇬🇧 United Kingdom', value: 'GB' }
      ]
    },
    enableColumnFilter: true
  },
  {
    id: 'numberType',
    accessorKey: 'numberType',
    header: 'Type',
    cell: ({ cell }) => {
      const type = cell.getValue<string>() || 'N/A';
      return (
        <Badge variant='outline' className='capitalize'>
          {type}
        </Badge>
      );
    },
    meta: {
      label: 'Type',
      placeholder: 'Select Type',
      variant: 'select',
      options: [
        { label: 'Local', value: 'local' },
        { label: 'Toll Free', value: 'toll_free' }
      ]
    },
    enableColumnFilter: true
  },
  {
    id: 'areaCode',
    accessorKey: 'region',
    header: 'Region',
    cell: ({ cell }) => (
      <span className='text-muted-foreground uppercase'>
        {cell.getValue<string>()}
      </span>
    ),
    meta: {
      label: 'Area Code',
      placeholder: 'Area Code',
      variant: 'number'
    },
    enableColumnFilter: true
  },
  {
    id: 'features',
    accessorKey: 'capabilities',
    header: 'Features',
    cell: ({ row }) => {
      const capabilities = row.original.capabilities;
      if (!capabilities) {
        return <span className='text-muted-foreground text-xs'>—</span>;
      }
      const enabled = FEATURE_OPTIONS.filter(
        (option) => capabilities[option.capabilityKey]
      );
      if (enabled.length === 0) {
        return <span className='text-muted-foreground text-xs'>—</span>;
      }
      return (
        <div className='flex flex-wrap gap-1'>
          {enabled.map((option) => (
            <Badge key={option.value} variant='secondary' className='text-xs'>
              {option.label}
            </Badge>
          ))}
        </div>
      );
    },
    meta: {
      label: 'Features',
      placeholder: 'Select features',
      variant: 'multiSelect',
      options: FEATURE_OPTIONS.map(({ value, label }) => ({ value, label }))
    },
    enableColumnFilter: true
  },
  {
    accessorKey: 'costInformation.monthlyCost',
    header: 'Cost',
    cell: ({ row }) => {
      const cost = row.original.costInformation.monthlyCost || 0;
      const currency = row.original.costInformation.currency || 'USD';
      return <span>{`${currency} ${Number(cost).toFixed(2)}`}</span>;
    }
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <CellActionBuy data={row.original} />
  }
];
