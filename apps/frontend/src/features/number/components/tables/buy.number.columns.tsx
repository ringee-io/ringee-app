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

// Telnyx number coverage (ISO 3166-1 alpha-2). `value` is passed straight
// through to Telnyx as filter[country_code]. Primary markets are pinned first,
// the rest are alphabetical by name. Source: telnyx.com/global-coverage.
const COUNTRY_OPTIONS = [
  { flag: '🇺🇸', name: 'United States', value: 'US' },
  { flag: '🇨🇦', name: 'Canada', value: 'CA' },
  { flag: '🇦🇱', name: 'Albania', value: 'AL' },
  { flag: '🇦🇴', name: 'Angola', value: 'AO' },
  { flag: '🇦🇮', name: 'Anguilla', value: 'AI' },
  { flag: '🇦🇬', name: 'Antigua and Barbuda', value: 'AG' },
  { flag: '🇦🇷', name: 'Argentina', value: 'AR' },
  { flag: '🇦🇺', name: 'Australia', value: 'AU' },
  { flag: '🇦🇹', name: 'Austria', value: 'AT' },
  { flag: '🇧🇸', name: 'Bahamas', value: 'BS' },
  { flag: '🇧🇭', name: 'Bahrain', value: 'BH' },
  { flag: '🇧🇩', name: 'Bangladesh', value: 'BD' },
  { flag: '🇧🇧', name: 'Barbados', value: 'BB' },
  { flag: '🇧🇪', name: 'Belgium', value: 'BE' },
  { flag: '🇧🇿', name: 'Belize', value: 'BZ' },
  { flag: '🇧🇯', name: 'Benin', value: 'BJ' },
  { flag: '🇧🇲', name: 'Bermuda', value: 'BM' },
  { flag: '🇧🇴', name: 'Bolivia', value: 'BO' },
  { flag: '🇧🇦', name: 'Bosnia and Herzegovina', value: 'BA' },
  { flag: '🇧🇼', name: 'Botswana', value: 'BW' },
  { flag: '🇧🇷', name: 'Brazil', value: 'BR' },
  { flag: '🇻🇬', name: 'British Virgin Islands', value: 'VG' },
  { flag: '🇧🇳', name: 'Brunei Darussalam', value: 'BN' },
  { flag: '🇧🇬', name: 'Bulgaria', value: 'BG' },
  { flag: '🇧🇫', name: 'Burkina Faso', value: 'BF' },
  { flag: '🇰🇭', name: 'Cambodia', value: 'KH' },
  { flag: '🇨🇲', name: 'Cameroon', value: 'CM' },
  { flag: '🇰🇾', name: 'Cayman Islands', value: 'KY' },
  { flag: '🇨🇱', name: 'Chile', value: 'CL' },
  { flag: '🇨🇳', name: 'China', value: 'CN' },
  { flag: '🇨🇴', name: 'Colombia', value: 'CO' },
  { flag: '🇨🇷', name: 'Costa Rica', value: 'CR' },
  { flag: '🇭🇷', name: 'Croatia', value: 'HR' },
  { flag: '🇨🇾', name: 'Cyprus', value: 'CY' },
  { flag: '🇨🇿', name: 'Czech Republic', value: 'CZ' },
  { flag: '🇩🇰', name: 'Denmark', value: 'DK' },
  { flag: '🇩🇲', name: 'Dominica', value: 'DM' },
  { flag: '🇩🇴', name: 'Dominican Republic', value: 'DO' },
  { flag: '🇪🇨', name: 'Ecuador', value: 'EC' },
  { flag: '🇪🇬', name: 'Egypt', value: 'EG' },
  { flag: '🇸🇻', name: 'El Salvador', value: 'SV' },
  { flag: '🇪🇪', name: 'Estonia', value: 'EE' },
  { flag: '🇪🇹', name: 'Ethiopia', value: 'ET' },
  { flag: '🇫🇮', name: 'Finland', value: 'FI' },
  { flag: '🇫🇷', name: 'France', value: 'FR' },
  { flag: '🇬🇫', name: 'French Guiana', value: 'GF' },
  { flag: '🇬🇪', name: 'Georgia', value: 'GE' },
  { flag: '🇩🇪', name: 'Germany', value: 'DE' },
  { flag: '🇬🇭', name: 'Ghana', value: 'GH' },
  { flag: '🇬🇷', name: 'Greece', value: 'GR' },
  { flag: '🇬🇩', name: 'Grenada', value: 'GD' },
  { flag: '🇬🇵', name: 'Guadeloupe', value: 'GP' },
  { flag: '🇬🇺', name: 'Guam', value: 'GU' },
  { flag: '🇬🇹', name: 'Guatemala', value: 'GT' },
  { flag: '🇭🇳', name: 'Honduras', value: 'HN' },
  { flag: '🇭🇰', name: 'Hong Kong', value: 'HK' },
  { flag: '🇭🇺', name: 'Hungary', value: 'HU' },
  { flag: '🇮🇸', name: 'Iceland', value: 'IS' },
  { flag: '🇮🇩', name: 'Indonesia', value: 'ID' },
  { flag: '🇮🇪', name: 'Ireland', value: 'IE' },
  { flag: '🇮🇱', name: 'Israel', value: 'IL' },
  { flag: '🇮🇹', name: 'Italy', value: 'IT' },
  { flag: '🇯🇲', name: 'Jamaica', value: 'JM' },
  { flag: '🇯🇵', name: 'Japan', value: 'JP' },
  { flag: '🇯🇴', name: 'Jordan', value: 'JO' },
  { flag: '🇰🇿', name: 'Kazakhstan', value: 'KZ' },
  { flag: '🇰🇪', name: 'Kenya', value: 'KE' },
  { flag: '🇰🇼', name: 'Kuwait', value: 'KW' },
  { flag: '🇱🇻', name: 'Latvia', value: 'LV' },
  { flag: '🇱🇹', name: 'Lithuania', value: 'LT' },
  { flag: '🇱🇺', name: 'Luxembourg', value: 'LU' },
  { flag: '🇲🇾', name: 'Malaysia', value: 'MY' },
  { flag: '🇲🇹', name: 'Malta', value: 'MT' },
  { flag: '🇲🇶', name: 'Martinique', value: 'MQ' },
  { flag: '🇲🇺', name: 'Mauritius', value: 'MU' },
  { flag: '🇾🇹', name: 'Mayotte', value: 'YT' },
  { flag: '🇲🇽', name: 'Mexico', value: 'MX' },
  { flag: '🇲🇩', name: 'Moldova', value: 'MD' },
  { flag: '🇲🇨', name: 'Monaco', value: 'MC' },
  { flag: '🇲🇪', name: 'Montenegro', value: 'ME' },
  { flag: '🇲🇦', name: 'Morocco', value: 'MA' },
  { flag: '🇲🇿', name: 'Mozambique', value: 'MZ' },
  { flag: '🇲🇲', name: 'Myanmar', value: 'MM' },
  { flag: '🇳🇵', name: 'Nepal', value: 'NP' },
  { flag: '🇳🇱', name: 'Netherlands', value: 'NL' },
  { flag: '🇳🇿', name: 'New Zealand', value: 'NZ' },
  { flag: '🇳🇮', name: 'Nicaragua', value: 'NI' },
  { flag: '🇳🇬', name: 'Nigeria', value: 'NG' },
  { flag: '🇳🇴', name: 'Norway', value: 'NO' },
  { flag: '🇴🇲', name: 'Oman', value: 'OM' },
  { flag: '🇵🇰', name: 'Pakistan', value: 'PK' },
  { flag: '🇵🇦', name: 'Panama', value: 'PA' },
  { flag: '🇵🇬', name: 'Papua New Guinea', value: 'PG' },
  { flag: '🇵🇾', name: 'Paraguay', value: 'PY' },
  { flag: '🇵🇪', name: 'Peru', value: 'PE' },
  { flag: '🇵🇭', name: 'Philippines', value: 'PH' },
  { flag: '🇵🇱', name: 'Poland', value: 'PL' },
  { flag: '🇵🇹', name: 'Portugal', value: 'PT' },
  { flag: '🇵🇷', name: 'Puerto Rico', value: 'PR' },
  { flag: '🇶🇦', name: 'Qatar', value: 'QA' },
  { flag: '🇷🇴', name: 'Romania', value: 'RO' },
  { flag: '🇷🇼', name: 'Rwanda', value: 'RW' },
  { flag: '🇸🇦', name: 'Saudi Arabia', value: 'SA' },
  { flag: '🇷🇸', name: 'Serbia', value: 'RS' },
  { flag: '🇸🇨', name: 'Seychelles', value: 'SC' },
  { flag: '🇸🇬', name: 'Singapore', value: 'SG' },
  { flag: '🇸🇰', name: 'Slovakia', value: 'SK' },
  { flag: '🇸🇮', name: 'Slovenia', value: 'SI' },
  { flag: '🇿🇦', name: 'South Africa', value: 'ZA' },
  { flag: '🇪🇸', name: 'Spain', value: 'ES' },
  { flag: '🇱🇰', name: 'Sri Lanka', value: 'LK' },
  { flag: '🇸🇪', name: 'Sweden', value: 'SE' },
  { flag: '🇨🇭', name: 'Switzerland', value: 'CH' },
  { flag: '🇹🇿', name: 'Tanzania', value: 'TZ' },
  { flag: '🇹🇭', name: 'Thailand', value: 'TH' },
  { flag: '🇹🇹', name: 'Trinidad and Tobago', value: 'TT' },
  { flag: '🇹🇨', name: 'Turks and Caicos Islands', value: 'TC' },
  { flag: '🇺🇬', name: 'Uganda', value: 'UG' },
  { flag: '🇺🇦', name: 'Ukraine', value: 'UA' },
  { flag: '🇦🇪', name: 'United Arab Emirates', value: 'AE' },
  { flag: '🇬🇧', name: 'United Kingdom', value: 'GB' },
  { flag: '🇺🇾', name: 'Uruguay', value: 'UY' },
  { flag: '🇺🇿', name: 'Uzbekistan', value: 'UZ' },
  { flag: '🇻🇪', name: 'Venezuela', value: 'VE' },
  { flag: '🇻🇳', name: 'Vietnam', value: 'VN' },
  { flag: '🇿🇲', name: 'Zambia', value: 'ZM' },
  { flag: '🇿🇼', name: 'Zimbabwe', value: 'ZW' }
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
    size: 160,
    minSize: 160,
    header: () => {
      const t = useTranslations('settings.numbers.buy.table');
      return <span className='sr-only'>{t('actions')}</span>;
    },
    cell: ({ row }) => <CellActionBuy data={row.original} />
  }
];
