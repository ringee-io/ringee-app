'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronRight,
  IconEye,
  IconHistory,
  IconRefresh
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import type { DedupAction, DuplicateSearchNotice } from '../types';

interface Props {
  notice: DuplicateSearchNotice;
  onAction: (action: DedupAction) => void;
  disabled?: boolean;
}

const ACTION_ICON: Record<DedupAction, typeof IconHistory> = {
  show_previous: IconEye,
  next_page: IconChevronRight,
  broaden: IconArrowsMaximize,
  narrow: IconArrowsMinimize,
  refresh: IconRefresh
};

const ACTION_KEY: Record<DedupAction, string> = {
  show_previous: 'actionShowPrevious',
  next_page: 'actionNextPage',
  broaden: 'actionBroaden',
  narrow: 'actionNarrow',
  refresh: 'actionRefresh'
};

/** Title-case a provider slug (e.g. `apollo` → `Apollo`). */
function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * Compact decision card shown when the prospecting agent detects that the
 * user is about to repeat a recent search. It surfaces the previous run and
 * lets the user pick what to do instead of silently spending credits.
 */
export function DuplicateSearchCard({ notice, onAction, disabled }: Props) {
  const t = useTranslations('ai.dedup');
  const { match, relationship } = notice;
  const provider = capitalize(match.provider);
  const when = formatWhen(t, match.ageHours);

  const summary =
    relationship === 'identical'
      ? t('freshIdentical', {
          when,
          provider,
          count: match.leadCount
        })
      : t('freshSimilar', {
          percent: Math.round(match.similarity * 100),
          when,
          provider,
          count: match.leadCount
        });

  // Keep the recommended action order from the backend, de-duplicated.
  const actions = Array.from(new Set(notice.recommendedActions));

  return (
    <div className='rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent p-3'>
      <div className='flex items-center gap-2'>
        <span className='flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/25 text-amber-700 dark:text-amber-300'>
          <IconHistory size={13} />
        </span>
        <span className='text-sm font-semibold'>
          {relationship === 'identical'
            ? t('identicalTitle')
            : t('similarTitle')}
        </span>
      </div>

      <p className='text-muted-foreground mt-1.5 text-xs leading-relaxed'>
        {summary}
        {!match.fresh && <> {t('staleNote')}</>}
        {match.revealedCount > 0 && (
          <> {t('revealed', { count: match.revealedCount })}</>
        )}
      </p>

      {match.filtersSummary && (
        <p className='text-muted-foreground/80 mt-1 line-clamp-2 text-[11px] italic'>
          {match.filtersSummary}
        </p>
      )}

      <div className='mt-2.5 flex flex-wrap gap-1.5'>
        {actions.map((action) => {
          const Icon = ACTION_ICON[action];
          const primary = action === 'show_previous' || action === 'next_page';
          return (
            <Button
              key={action}
              size='sm'
              variant={primary ? 'default' : 'outline'}
              className='h-7 gap-1 text-xs'
              disabled={disabled}
              onClick={() => onAction(action)}
            >
              <Icon size={13} />
              {t(ACTION_KEY[action])}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function formatWhen(
  t: ReturnType<typeof useTranslations>,
  ageHours: number
): string {
  if (ageHours < 1) {
    return t('whenMinutes', { count: Math.max(1, Math.round(ageHours * 60)) });
  }
  if (ageHours < 48) {
    return t('whenHours', { count: Math.round(ageHours) });
  }
  return t('whenDays', { count: Math.round(ageHours / 24) });
}
