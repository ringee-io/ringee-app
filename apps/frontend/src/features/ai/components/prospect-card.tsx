'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconArrowUpRight,
  IconBan,
  IconBookmark,
  IconBrandLinkedin,
  IconBriefcase,
  IconCopy,
  IconHistory,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPhoneCheck
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { LeadStatus, ProspectDetails, ProspectPreview } from '../types';
import { ProspectDetailModal } from './prospect-detail-modal';

interface Props {
  prospect: ProspectPreview;
  selected: boolean;
  onToggle: (externalId: string) => void;
}

export function ProspectCard({ prospect, selected, onToggle }: Props) {
  const t = useTranslations('ai.prospect');
  const [detailOpen, setDetailOpen] = useState(false);
  // `details` is absent on prospect cards persisted before the detail modal
  // shipped — fall back to a non-clickable name for those.
  const details = prospect.details as ProspectDetails | undefined;

  return (
    <div
      className={cn(
        'border-border/60 bg-card flex flex-col gap-2 rounded-lg border p-3 transition-colors',
        selected && 'border-primary/60 bg-primary/5'
      )}
    >
      <div className='flex items-start gap-2'>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(prospect.externalId)}
          className='mt-0.5'
        />
        <div className='min-w-0 flex-1'>
          <div className='flex items-center justify-between gap-2'>
            {details ? (
              <button
                type='button'
                onClick={() => setDetailOpen(true)}
                title={t('viewDetail')}
                className='group text-foreground hover:text-primary inline-flex min-w-0 items-center gap-1 text-left text-sm font-semibold transition-colors'
              >
                <span className='line-clamp-1 group-hover:underline'>
                  {prospect.fullName ?? t('unknown')}
                </span>
                <IconArrowUpRight
                  size={13}
                  className='text-muted-foreground group-hover:text-primary shrink-0 transition-colors'
                />
              </button>
            ) : (
              <span className='line-clamp-1 text-sm font-semibold'>
                {prospect.fullName ?? t('unknown')}
              </span>
            )}
            <FitScoreBadge score={prospect.fitScore} />
          </div>
          <div className='text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
            {prospect.jobTitle && (
              <span className='inline-flex items-center gap-1'>
                <IconBriefcase size={11} /> {prospect.jobTitle}
              </span>
            )}
            {prospect.company && (
              <span className='inline-flex items-center gap-1'>
                @ {prospect.company}
              </span>
            )}
            {prospect.location && (
              <span className='inline-flex items-center gap-1'>
                <IconMapPin size={11} /> {prospect.location}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-1.5 text-[11px]'>
        <LeadStatusBadge status={prospect.status} />
        <Badge variant='outline' className='gap-1'>
          <IconMail size={11} />
          {prospect.hasEmail ? t('emailAvailable') : t('emailHidden')}
        </Badge>
        <Badge variant='outline' className='gap-1'>
          <IconPhone size={11} />
          {prospect.hasPhone ? t('phoneAvailable') : t('phoneHidden')}
        </Badge>
        <Badge variant='secondary' className='capitalize'>
          {prospect.provider}
        </Badge>
        {typeof prospect.confidence === 'number' && (
          <Badge variant='outline'>
            {t('confidence', {
              percent: Math.round(prospect.confidence * 100)
            })}
          </Badge>
        )}
      </div>

      {prospect.reasons.length > 0 && (
        <ul className='text-muted-foreground space-y-0.5 text-xs'>
          {prospect.reasons.slice(0, 4).map((r, i) => (
            <li key={i} className='flex gap-1'>
              <span className='text-primary'>•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {prospect.linkedinUrl && (
        <a
          href={prospect.linkedinUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex w-fit items-center gap-1 text-xs font-medium text-[#0a66c2] transition-opacity hover:underline'
        >
          <IconBrandLinkedin size={14} />
          {t('viewLinkedin')}
        </a>
      )}

      {details && (
        <ProspectDetailModal
          prospect={prospect}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      )}
    </div>
  );
}

interface StatusMeta {
  key: string;
  icon: typeof IconHistory;
  className: string;
}

/**
 * Visual treatment per dedup status. `new` (and undefined, for previews
 * persisted before dedup shipped) renders nothing — only the statuses that
 * need the user's attention get a badge.
 */
const STATUS_META: Record<Exclude<LeadStatus, 'new'>, StatusMeta> = {
  seen_before: {
    key: 'statusSeenBefore',
    icon: IconHistory,
    className:
      'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  },
  already_saved: {
    key: 'statusAlreadySaved',
    icon: IconBookmark,
    className: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
  },
  already_called: {
    key: 'statusAlreadyCalled',
    icon: IconPhoneCheck,
    className: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
  },
  on_dnc: {
    key: 'statusOnDnc',
    icon: IconBan,
    className: 'border-destructive/50 bg-destructive/10 text-destructive'
  },
  duplicate_provider: {
    key: 'statusDuplicate',
    icon: IconCopy,
    className: 'border-border bg-muted text-muted-foreground'
  }
};

function LeadStatusBadge({ status }: { status?: LeadStatus }) {
  const t = useTranslations('ai.prospect');
  if (!status || status === 'new') return null;
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant='outline' className={cn('gap-1', meta.className)}>
      <Icon size={11} />
      {t(meta.key)}
    </Badge>
  );
}

function FitScoreBadge({ score }: { score: number }) {
  const t = useTranslations('ai.prospect');
  const tone = score >= 70 ? 'default' : score >= 40 ? 'secondary' : 'outline';
  return (
    <Badge variant={tone as 'default' | 'secondary' | 'outline'}>
      {t('fit', { score })}
    </Badge>
  );
}
