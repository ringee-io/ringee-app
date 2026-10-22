'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { IconDownload, IconFileTypeCsv, IconUpload } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  ToggleGroup,
  ToggleGroupItem
} from '@ringee/frontend-shared/components/ui/toggle-group';
import { cn } from '@ringee/frontend-shared/lib/utils';

/** The server's `CSV_IMPORT_CONFIG` limits, checked before uploading. */
export const CSV_LIMITS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_ROWS: 10000
};

export const CSV_REQUIRED_FIELDS = ['phoneNumber', 'name'];
export const CSV_OPTIONAL_FIELDS = [
  'email',
  'company',
  'jobTitle',
  'state',
  'website',
  'linkedinUrl',
  'companyLinkedinUrl',
  'revenue',
  'companySize',
  'location'
];

/**
 * Which tool wrote the file. The server reads an Apollo or Prospeo export
 * through that tool's own columns, so it is uploaded exactly as exported.
 */
export type CsvImportFormat = 'ringee' | 'apollo' | 'prospeo';

type ExportFormat = Exclude<CsvImportFormat, 'ringee'>;

const CSV_FORMATS: { id: CsvImportFormat; logo: string }[] = [
  { id: 'ringee', logo: '/android-chrome-192x192.png' },
  { id: 'apollo', logo: '/companies/apollo.png' },
  { id: 'prospeo', logo: '/companies/prospeo.svg' }
];

const TOOL_NAMES: Record<ExportFormat, string> = {
  apollo: 'Apollo',
  prospeo: 'Prospeo'
};

/** The headers an export needs, as the tool names them — the server's map, abridged. */
const EXPORT_COLUMNS: Record<
  ExportFormat,
  { phone: string[]; name: string[] }
> = {
  apollo: {
    phone: ['Mobile Phone', 'Work Direct Phone', 'Corporate Phone'],
    name: ['First Name', 'Last Name']
  },
  prospeo: { phone: ['Mobile', 'Company HQ Phone'], name: ['Full name'] }
};

/** Names the file's format on an upload; Ringee's template is the default. */
export function appendCsvFormat(body: FormData, format: CsvImportFormat) {
  if (format !== 'ringee') body.append('format', format);
}

/** Where the file comes from: Ringee's template, or a tool's export as it is. */
export function CsvFormatPicker({
  value,
  onChange,
  disabled
}: {
  value: CsvImportFormat;
  onChange: (format: CsvImportFormat) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('contacts.import.formats');
  const labelId = useId();

  return (
    <div className='space-y-2'>
      <p id={labelId} className='text-sm font-medium'>
        {t('label')}
      </p>
      <ToggleGroup
        type='single'
        variant='outline'
        value={value}
        onValueChange={(next) => {
          // Radix clears the value when the pressed item is clicked again.
          if (next) onChange(next as CsvImportFormat);
        }}
        disabled={disabled}
        aria-labelledby={labelId}
        className='w-full'
      >
        {CSV_FORMATS.map(({ id, logo }) => (
          <ToggleGroupItem
            key={id}
            value={id}
            className='h-10 gap-2 px-2.5 data-[state=on]:font-semibold'
          >
            <Image
              src={logo}
              alt=''
              width={16}
              height={16}
              className='size-4 shrink-0 rounded-[4px] object-contain'
            />
            {id === 'ringee' ? (
              <span className='truncate'>
                {/* A phone-width dialog has room for the brand only. */}
                <span className='sm:hidden'>Ringee</span>
                <span className='hidden sm:inline'>{t('ringee')}</span>
              </span>
            ) : (
              <span className='truncate'>{TOOL_NAMES[id]}</span>
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/**
 * Picks one contacts CSV, dropped or clicked. A file the server would refuse
 * (not `.csv`, too large) is reported through `onError` instead.
 */
export function CsvDropzone({
  file,
  onFileChange,
  onError,
  className
}: {
  file: File | null;
  onFileChange: (file: File) => void;
  onError: (message: string) => void;
  className?: string;
}) {
  const t = useTranslations('contacts.import');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const select = (selected: File) => {
    if (!selected.name.toLowerCase().endsWith('.csv')) {
      onError(t('onlyCsv'));
      return;
    }
    if (selected.size > CSV_LIMITS.MAX_FILE_SIZE) {
      onError(
        t('fileTooLarge', { size: CSV_LIMITS.MAX_FILE_SIZE / (1024 * 1024) })
      );
      return;
    }
    onFileChange(selected);
  };

  return (
    <div
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) select(dropped);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onClick={() => inputRef.current?.click()}
      // Reachable without a mouse: Enter or Space opens the file picker.
      role='button'
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={cn(
        'focus-visible:border-ring focus-visible:ring-ring/50 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors outline-none focus-visible:ring-[3px]',
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-primary/50',
        file && 'border-green-500/50 bg-green-500/5',
        className
      )}
    >
      <input
        ref={inputRef}
        type='file'
        accept='.csv'
        className='hidden'
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) select(picked);
          // Picking the same file again after an error still fires a change.
          e.target.value = '';
        }}
      />

      {file ? (
        <>
          <IconFileTypeCsv className='text-primary mb-2 h-10 w-10' />
          <span className='font-medium'>{file.name}</span>
          <span className='text-muted-foreground text-sm'>
            {(file.size / 1024).toFixed(1)} KB
          </span>
        </>
      ) : (
        <>
          <IconUpload className='text-muted-foreground mb-2 h-10 w-10' />
          <span className='font-medium'>{t('dropzoneAlt')}</span>
          <span className='text-muted-foreground text-sm'>
            {t('maxSize', { size: CSV_LIMITS.MAX_FILE_SIZE / (1024 * 1024) })} •{' '}
            {t('maxRows', { count: CSV_LIMITS.MAX_ROWS.toLocaleString() })}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * What the file needs in the format it comes in: the template's columns and a
 * copy to start from, or the columns a tool's export is read from.
 */
export function CsvFormatHelp({
  format = 'ringee'
}: {
  format?: CsvImportFormat;
}) {
  if (format !== 'ringee') return <CsvExportHelp format={format} />;
  return <CsvTemplateHelp />;
}

function CsvExportHelp({ format }: { format: ExportFormat }) {
  const t = useTranslations('contacts.import.formats');
  const formatter = useFormatter();
  const tool = TOOL_NAMES[format];
  const columns = EXPORT_COLUMNS[format];
  const header = (name: string) => (
    <code
      key={name}
      className='bg-background rounded px-1 py-0.5 font-mono whitespace-nowrap'
    >
      {name}
    </code>
  );

  return (
    <div className='bg-muted/50 rounded-lg p-3 text-sm'>
      <div className='mb-2 font-medium'>{t('asExported', { tool })}</div>
      <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs leading-5'>
        <dt className='text-muted-foreground'>{t('phone')}</dt>
        <dd>
          {formatter.list(columns.phone.map(header), { type: 'disjunction' })}
        </dd>
        <dt className='text-muted-foreground'>{t('name')}</dt>
        <dd>{formatter.list(columns.name.map(header))}</dd>
        <dt className='text-muted-foreground'>{t('also')}</dt>
        <dd>{t('alsoFields')}</dd>
      </dl>
      <p className='text-muted-foreground mt-2 text-xs'>
        {t('phoneRequired', { tool })}
      </p>
    </div>
  );
}

/** The columns Ringee's template takes, and a copy to start from. */
function CsvTemplateHelp() {
  const t = useTranslations('contacts.import');

  const downloadTemplate = () => {
    const headers = [...CSV_REQUIRED_FIELDS, ...CSV_OPTIONAL_FIELDS].join(',');
    const example =
      '+1234567890,John Doe,john@example.com,Acme Inc,Sales Manager,New York,https://acme.com,https://linkedin.com/in/john-doe,https://linkedin.com/company/acme,$10M-$50M,51-200,New York';
    const csv = `${headers}\n${example}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className='bg-muted/50 rounded-lg p-3 text-sm'>
      <div className='mb-2 font-medium'>{t('csvFormat')}</div>
      <div className='space-y-1 text-xs'>
        <div>
          <span className='text-green-500'>{t('required')}</span>{' '}
          {CSV_REQUIRED_FIELDS.join(', ')}
        </div>
        <div>
          <span className='text-muted-foreground'>{t('optional')}</span>{' '}
          {CSV_OPTIONAL_FIELDS.join(', ')}
        </div>
      </div>
      <Button
        type='button'
        variant='link'
        size='sm'
        className='mt-2 h-auto p-0 text-xs'
        onClick={(e) => {
          e.stopPropagation();
          downloadTemplate();
        }}
      >
        <IconDownload className='mr-1 h-3 w-3' />
        {t('downloadTemplate')}
      </Button>
    </div>
  );
}
