'use client';

import { useTranslations } from 'next-intl';
import { IconCheck } from '@tabler/icons-react';
import type { ContactListImportSummary } from '../types';

/** What a CSV upload did to a list, with the rows it had to skip. */
export function ListImportSummary({
  summary
}: {
  summary: ContactListImportSummary;
}) {
  const t = useTranslations('lists.import');

  const tiles = [
    {
      label: t('addedToList'),
      value: summary.addedToList,
      tone: 'text-green-600'
    },
    {
      label: t('alreadyInList'),
      value: summary.alreadyInList,
      tone: ''
    },
    {
      label: t('contactsCreated'),
      value: summary.contactsCreated,
      tone: ''
    },
    {
      label: t('invalidRows'),
      value: summary.invalidRows,
      tone: summary.invalidRows > 0 ? 'text-red-600' : ''
    }
  ];

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm font-medium text-green-700 dark:text-green-400'>
        <IconCheck className='size-4' />
        {t('summaryTitle')}
      </div>

      <dl className='grid grid-cols-2 gap-3 text-sm'>
        {tiles.map((tile) => (
          <div key={tile.label} className='bg-muted rounded-lg p-3'>
            <dt className='text-muted-foreground'>{tile.label}</dt>
            <dd className={`text-xl font-semibold tabular-nums ${tile.tone}`}>
              {tile.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      {summary.errors.length > 0 ? (
        <div className='border-destructive/20 max-h-36 overflow-y-auto rounded-lg border p-3'>
          <div className='text-destructive mb-2 text-sm font-medium'>
            {t('skippedRows')} ({summary.invalidRows.toLocaleString()})
          </div>
          <ul className='text-muted-foreground space-y-0.5 text-xs'>
            {summary.errors.map((error, index) => (
              <li key={`${error.row}-${index}`}>
                {t('row', { row: error.row, message: error.message })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
