'use client';

import { ColumnDef, Column } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@ringee/frontend-shared/components/ui/table/data-table-column-header';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { CellActionBuy } from './buy.number.cell.action';
import { useTranslations } from 'next-intl';

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
  labelKey: string;
  capabilityKey: keyof Capabilities;
}[] = [
  { value: 'voice', labelKey: 'voice', capabilityKey: 'voice' },
  { value: 'sms', labelKey: 'sms', capabilityKey: 'sms' },
  { value: 'mms', labelKey: 'mms', capabilityKey: 'mms' },
  { value: 'hd_voice', labelKey: 'hdVoice', capabilityKey: 'hdVoice' },
  {
    value: 'international_sms',
    labelKey: 'internationalSms',
    capabilityKey: 'internationalSms'
  },
  { value: 'emergency', labelKey: 'emergency', capabilityKey: 'emergency' },
  { value: 'fax', labelKey: 'fax', capabilityKey: 'fax' }
];

const COUNTRY_OPTIONS = [
  { flag: '🇺🇸', name: 'United States', value: 'US' },
  { flag: '🇨🇦', name: 'Canada', value: 'CA' },
  { flag: '🇪🇸', name: 'Spain', value: 'ES' },
  { flag: '🇬🇧', name: 'United Kingdom', value: 'GB' },
  { flag: '🇦🇷', name: 'Argentina', value: 'AR' },
  { flag: '🇵🇦', name: 'Panama', value: 'PA' },
  { flag: '🇲🇽', name: 'Mexico', value: 'MX' }
];

export const columns: ColumnDef<AvailableNumber>[] = [
  {
    accessorKey: 'phoneNumber',
    header: ({ column }: { column: Column<AvailableNumber, unknown> }) => {
      const t = useTranslations('settings.numbers.buy.table');
      return <DataTableColumnHeader column={column} title={t('phoneNumber')} />;
    },
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
    header: () => {
      const t = useTranslations('settings.numbers.buy.table');
      return <>{t('country')}</>;
    },
    cell: ({ cell }) => (
      <span className='text-muted-foreground uppercase'>
        {cell.getValue<string>()}
      </span>
    ),
    meta: {
      label: 'Country',
      placeholder: 'Select Country',
      variant: 'select',
      options: COUNTRY_OPTIONS.map((c) => ({
        label: `${c.flag} ${c.name}`,
        value: c.value
      }))
    },
    enableColumnFilter: true
  },
  {
    id: 'numberType',
    accessorKey: 'numberType',
    header: () => {
      const t = useTranslations('settings.numbers.buy.table');
      return <>{t('type')}</>;
    },
    cell: ({ cell }) => {
      const t = useTranslations('settings.numbers.my.table');
      const type = cell.getValue<string>() || t('na');
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
    header: () => {
      const t = useTranslations('settings.numbers.buy.table');
      return <>{t('region')}</>;
    },
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
    header: () => {
      const t = useTranslations('settings.numbers.buy.table');
      return <>{t('features')}</>;
    },
    cell: ({ row }) => {
      const t = useTranslations('settings.numbers.buy.features');
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
              {t(option.labelKey as any)}
            </Badge>
          ))}
        </div>
      );
    },
    meta: {
      label: 'Features',
      placeholder: 'Select features',
      variant: 'multiSelect',
      options: FEATURE_OPTIONS.map(({ value, labelKey }) => ({
        value,
        label: labelKey
      }))
    },
    enableColumnFilter: true
  },
  {
    accessorKey: 'costInformation.monthlyCost',
    header: () => {
      const t = useTranslations('settings.numbers.buy.table');
      return <>{t('cost')}</>;
    },
    cell: ({ row }) => {
      const cost = row.original.costInformation.monthlyCost || 0;
      const currency = row.original.costInformation.currency || 'USD';
      return <span>{`${currency} ${Number(cost).toFixed(2)}`}</span>;
    }
  },
  {
    id: 'actions',
    header: () => {
      const t = useTranslations('settings.numbers.buy.table');
      return <>{t('actions')}</>;
    },
    cell: ({ row }) => <CellActionBuy data={row.original} />
  }
];
