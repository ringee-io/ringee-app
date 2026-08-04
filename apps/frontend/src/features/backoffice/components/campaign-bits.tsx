'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: 'default',
  paused: 'secondary',
  draft: 'outline',
  completed: 'secondary'
};

export function CampaignStatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{status}</Badge>;
}

const CATEGORY_VARIANT: Record<string, BadgeVariant> = {
  positive: 'default',
  neutral: 'secondary',
  negative: 'destructive',
  no_contact: 'outline'
};

export function DispositionCategoryBadge({
  category
}: {
  category: string | null;
}) {
  if (!category) return <span className='text-muted-foreground'>—</span>;
  return (
    <Badge variant={CATEGORY_VARIANT[category] ?? 'outline'}>
      {category.replace(/_/g, ' ')}
    </Badge>
  );
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Campaign work days are stored as 0=Sun..6=Sat. */
export function formatWorkDays(days: number[]): string {
  if (days.length === 7) return 'Every day';
  if (!days.length) return '—';
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d] ?? d)
    .join(', ');
}

/** Minutes-from-midnight in the campaign timezone. */
export function formatMinuteOfDay(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
