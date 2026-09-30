'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { CampaignStatus } from '../types/campaign.types';

const STATUS_CLASSES: Record<CampaignStatus, string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  active:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  paused:
    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  completed: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
};

/** One campaign status badge for the list and the detail, light and dark. */
export function CampaignStatusBadge({
  status,
  className
}: {
  status: CampaignStatus;
  className?: string;
}) {
  const t = useTranslations('campaigns.status');

  return (
    <Badge
      variant='outline'
      className={cn('gap-1.5', STATUS_CLASSES[status], className)}
    >
      {status === 'active' ? (
        <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500' />
      ) : null}
      {t(status)}
    </Badge>
  );
}
