'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { OfferParticipationStatus, OfferStatus } from '../api';

const OFFER_STATUS_STYLES: Record<OfferStatus, string> = {
  ACTIVE: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  DRAFT: 'border-muted-foreground/30 text-muted-foreground',
  PAUSED: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  ENDED: 'border-muted-foreground/30 text-muted-foreground',
  ARCHIVED: 'border-muted-foreground/30 text-muted-foreground'
};

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return (
    <Badge
      variant='outline'
      className={cn('text-xs', OFFER_STATUS_STYLES[status])}
    >
      {status}
    </Badge>
  );
}

const PARTICIPATION_STYLES: Record<OfferParticipationStatus, string> = {
  ELIGIBLE: 'border-muted-foreground/30 text-muted-foreground',
  STARTED: 'border-muted-foreground/30 text-muted-foreground',
  SUBMITTED: 'border-sky-500/40 text-sky-600 dark:text-sky-400',
  PENDING_APPROVAL: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  APPROVED: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  REJECTED: 'border-red-500/40 text-red-600 dark:text-red-400',
  COMPLETED: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  REWARDED: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
};

export function ParticipationStatusBadge({
  status
}: {
  status: OfferParticipationStatus;
}) {
  return (
    <Badge
      variant='outline'
      className={cn('text-xs', PARTICIPATION_STYLES[status])}
    >
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

/**
 * Submissions are free-form JSON (`{ url }`, survey answers, a referral email),
 * so the reviewer gets whatever the offer asked for. A value that looks like a
 * link becomes one — that is the whole "open the submission" affordance, with
 * no per-offer code.
 */
export function SubmissionPreview({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') {
    return <span className='text-muted-foreground text-xs'>—</span>;
  }

  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) {
    return <span className='text-muted-foreground text-xs'>—</span>;
  }

  return (
    <div className='space-y-0.5'>
      {entries.map(([key, value]) => {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        const isLink = /^https?:\/\//i.test(text);
        return (
          <div key={key} className='text-xs'>
            <span className='text-muted-foreground'>{key}: </span>
            {isLink ? (
              <a
                href={text}
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary max-w-[280px] truncate underline'
              >
                {text}
              </a>
            ) : (
              <span className='break-all'>{text}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
