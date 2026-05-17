'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconArrowUpRight,
  IconBrandLinkedin,
  IconBriefcase,
  IconMail,
  IconMapPin,
  IconPhone
} from '@tabler/icons-react';
import { useState } from 'react';
import type { ProspectDetails, ProspectPreview } from '../types';
import { ProspectDetailModal } from './prospect-detail-modal';

interface Props {
  prospect: ProspectPreview;
  selected: boolean;
  onToggle: (externalId: string) => void;
}

export function ProspectCard({ prospect, selected, onToggle }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  // `details` is absent on prospect cards persisted before the detail modal
  // shipped — fall back to a non-clickable name for those.
  const details = prospect.details as ProspectDetails | undefined;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3 transition-colors',
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
                title='View full lead detail'
                className='group inline-flex min-w-0 items-center gap-1 text-left text-sm font-semibold text-foreground transition-colors hover:text-primary'
              >
                <span className='line-clamp-1 group-hover:underline'>
                  {prospect.fullName ?? 'Unknown'}
                </span>
                <IconArrowUpRight
                  size={13}
                  className='shrink-0 text-muted-foreground transition-colors group-hover:text-primary'
                />
              </button>
            ) : (
              <span className='line-clamp-1 text-sm font-semibold'>
                {prospect.fullName ?? 'Unknown'}
              </span>
            )}
            <FitScoreBadge score={prospect.fitScore} />
          </div>
          <div className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
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
        <Badge variant='outline' className='gap-1'>
          <IconMail size={11} />
          {prospect.hasEmail ? 'Email available' : 'Email hidden'}
        </Badge>
        <Badge variant='outline' className='gap-1'>
          <IconPhone size={11} />
          {prospect.hasPhone ? 'Phone available' : 'Phone hidden'}
        </Badge>
        <Badge variant='secondary' className='capitalize'>
          {prospect.provider}
        </Badge>
        {typeof prospect.confidence === 'number' && (
          <Badge variant='outline'>
            {Math.round(prospect.confidence * 100)}% confidence
          </Badge>
        )}
      </div>

      {prospect.reasons.length > 0 && (
        <ul className='space-y-0.5 text-xs text-muted-foreground'>
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
          View LinkedIn profile
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

function FitScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 70 ? 'default' : score >= 40 ? 'secondary' : 'outline';
  return (
    <Badge variant={tone as 'default' | 'secondary' | 'outline'}>
      Fit {score}
    </Badge>
  );
}
