'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconDownload, IconFileTypeCsv, IconUpload } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
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
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
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

/** The columns a contacts CSV takes, and a template to start from. */
export function CsvFormatHelp() {
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
