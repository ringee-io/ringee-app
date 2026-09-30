'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { CampaignSummary } from '../types/campaign.types';
import {
  LEAD_PROGRESS_BAR,
  LEAD_PROGRESS_GROUP,
  LEAD_PROGRESS_ORDER,
  type LeadProgressGroup
} from '../lib/lead-status';

/** `161` → `2:41`. The API sends the average as a number or a decimal string. */
function formatTalkTime(value: number | string | null | undefined): string {
  const seconds = Math.round(Number(value ?? 0));
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Metric({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good';
}) {
  return (
    <div className='min-w-0'>
      <p className='text-muted-foreground text-xs font-medium'>{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tracking-tight tabular-nums',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400'
        )}
      >
        {value}
      </p>
      {detail ? (
        <p className='text-muted-foreground mt-0.5 truncate text-xs'>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The numbers that say whether the campaign is selling, above the tabs so they
 * are the first thing read: how far through the list it is, how many calls
 * reach someone, how many turn into a meeting or a sale, and how long the
 * conversations run.
 */
export function CampaignKpis({
  summary,
  loading,
  error,
  leadCount,
  onRetry
}: {
  summary: CampaignSummary | null;
  loading: boolean;
  error: boolean;
  leadCount: number;
  onRetry: () => void;
}) {
  const t = useTranslations('campaigns.detail.kpis');
  const format = useFormatter();

  if (loading && !summary) {
    return (
      <Card className='py-0'>
        <CardContent className='grid gap-6 p-5 sm:grid-cols-2 xl:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='space-y-2'>
              <Skeleton className='h-3 w-24' />
              <Skeleton className='h-7 w-16' />
              <Skeleton className='h-3 w-32' />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error && !summary) {
    return (
      <Card className='py-0'>
        <CardContent className='text-muted-foreground flex flex-wrap items-center gap-3 p-5 text-sm'>
          <AlertTriangle className='h-4 w-4 text-amber-500' />
          {t('error')}
          <Button variant='outline' size='sm' onClick={onRetry}>
            <RotateCw className='mr-1.5 h-3.5 w-3.5' />
            {t('retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const s = summary;
  const total = Math.max(
    leadCount,
    (s?.leadsByStatus ?? []).reduce((sum, row) => sum + row.count, 0)
  );
  const groups = LEAD_PROGRESS_ORDER.reduce(
    (acc, group) => ({ ...acc, [group]: 0 }),
    {} as Record<LeadProgressGroup, number>
  );
  for (const row of s?.leadsByStatus ?? []) {
    const group = LEAD_PROGRESS_GROUP[row.status];
    if (group) groups[group] += row.count;
  }
  const dialed = s?.uniqueLeadsDialed ?? 0;
  const attempts = s?.totalAttempts ?? 0;
  const pct = (part: number, whole: number) =>
    whole > 0 ? Math.round((part / whole) * 100) : 0;

  return (
    <Card className='gap-0 py-0'>
      <CardContent className='grid gap-6 p-5 sm:grid-cols-2 xl:grid-cols-4'>
        <Metric
          label={t('dialed')}
          value={format.number(dialed)}
          detail={t('dialedDetail', {
            total: format.number(total),
            percent: pct(dialed, total)
          })}
        />
        <Metric
          label={t('contactRate')}
          value={attempts > 0 ? `${format.number(s?.contactRate ?? 0)}%` : '—'}
          detail={t('contactRateDetail', {
            connected: format.number(s?.connected ?? 0),
            attempts: format.number(attempts)
          })}
        />
        <Metric
          label={t('conversions')}
          value={format.number(s?.conversions ?? 0)}
          tone={(s?.conversions ?? 0) > 0 ? 'good' : undefined}
          detail={
            attempts > 0
              ? t('conversionsDetail', {
                  rate: format.number(s?.conversionRate ?? 0)
                })
              : t('conversionsHint')
          }
        />
        <Metric
          label={t('talkTime')}
          value={formatTalkTime(s?.avgHandleTimeSec)}
          detail={t('talkTimeDetail')}
        />
      </CardContent>

      {total > 0 ? (
        <div className='border-t px-5 py-4'>
          <div
            className='bg-muted flex h-2 w-full overflow-hidden rounded-full'
            role='img'
            aria-label={t('progressLabel')}
          >
            {LEAD_PROGRESS_ORDER.map((group) =>
              groups[group] > 0 ? (
                <div
                  key={group}
                  className={cn('h-full', LEAD_PROGRESS_BAR[group])}
                  style={{ width: `${(groups[group] / total) * 100}%` }}
                />
              ) : null
            )}
          </div>
          <ul className='text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs'>
            {LEAD_PROGRESS_ORDER.map((group) => (
              <li key={group} className='flex items-center gap-1.5'>
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    LEAD_PROGRESS_BAR[group]
                  )}
                />
                <span className='text-foreground font-medium tabular-nums'>
                  {format.number(groups[group])}
                </span>
                {t(`groups.${group}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
