'use client';

import { useTranslations } from 'next-intl';
import { FileSpreadsheet, Keyboard, Users } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { FirstListSource } from '../../hooks/use.first.list.builder';

const ICONS = {
  file: FileSpreadsheet,
  typed: Keyboard,
  contacts: Users
} as const;

/**
 * Where the people come from, one card each. A card is the answer: picking
 * one moves straight on. "From your contacts" only shows once the workspace
 * has some.
 */
export function SourceChoice({
  contactTotal,
  onChoose
}: {
  /** Contacts the workspace has; null while unknown. */
  contactTotal: number | null;
  onChoose: (source: FirstListSource) => void;
}) {
  const t = useTranslations('onboarding.firstList.choose');
  const sources: FirstListSource[] =
    contactTotal && contactTotal > 0
      ? ['file', 'typed', 'contacts']
      : ['file', 'typed'];

  return (
    <div
      className={cn(
        'grid gap-3',
        sources.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
      )}
    >
      {sources.map((source) => {
        const Icon = ICONS[source];
        return (
          <button
            key={source}
            type='button'
            onClick={() => onChoose(source)}
            className='group bg-card flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-[border-color,box-shadow,translate] outline-none hover:border-emerald-500/60 hover:shadow-md focus-visible:border-emerald-500 focus-visible:ring-[3px] focus-visible:ring-emerald-500/25 sm:min-h-[10.5rem] sm:flex-col sm:items-start sm:gap-3 sm:p-4 sm:motion-safe:hover:-translate-y-px sm:motion-safe:active:translate-y-0 dark:hover:border-emerald-400/50'
          >
            <span className='bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors group-hover:bg-emerald-600 group-hover:text-white group-focus-visible:bg-emerald-600 group-focus-visible:text-white'>
              <Icon className='size-5' />
            </span>
            <span className='flex min-w-0 flex-1 flex-col gap-1'>
              <span className='text-[15px] leading-tight font-semibold'>
                {t(`${source}.title`)}
              </span>
              <span className='text-muted-foreground text-[13px] leading-snug'>
                {t(`${source}.description`)}
              </span>
              <span className='text-muted-foreground text-xs font-medium sm:mt-auto sm:pt-2'>
                {source === 'contacts'
                  ? t('contacts.badge', { count: contactTotal ?? 0 })
                  : t(`${source}.badge`)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
