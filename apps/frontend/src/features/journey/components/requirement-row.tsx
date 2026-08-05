'use client';

import Link from 'next/link';
import { IconArrowRight, IconCheck } from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useJourneyCopy } from '../lib/copy';
import { actionIcon, actionRoute } from '../lib/presentation';
import type { JourneyRequirement } from '../types';

/**
 * One checkable requirement.
 *
 * Everything shown here — the target, the current value, whether it is done —
 * comes from the API. This component only picks an icon, a route and a label.
 *
 * Accessibility: state is carried by an icon, a text label and a screen-reader
 * prefix, never by colour alone, and the bar is a real `progressbar` with
 * min/max/now so assistive tech reads "12 of 15".
 */
export function RequirementRow({
  requirement,
  interactive = true
}: {
  requirement: JourneyRequirement;
  /** Locked stages render read-only — no CTA into a dead end. */
  interactive?: boolean;
}) {
  const { t, dynamic } = useJourneyCopy();
  const ActionIcon = actionIcon(requirement.actionKey);

  const label = dynamic(`requirement.${requirement.id}`, requirement.id);
  const actionLabel = dynamic(
    `action.${requirement.actionKey}`,
    requirement.actionKey
  );
  const stateLabel = requirement.done ? t('a11y.done') : t('a11y.notDone');

  return (
    <li className='flex items-start gap-3 py-2.5'>
      <span
        aria-hidden='true'
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
          requirement.done
            ? 'border-emerald-600/40 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'
            : 'border-muted-foreground/30 text-muted-foreground'
        )}
      >
        {requirement.done ? (
          <IconCheck className='size-3' stroke={3} />
        ) : (
          <ActionIcon className='size-3' />
        )}
      </span>

      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
          <p
            className={cn(
              'text-sm',
              requirement.done
                ? 'text-muted-foreground'
                : 'text-foreground font-medium'
            )}
          >
            <span className='sr-only'>{stateLabel}: </span>
            {label}
          </p>
          <p className='text-muted-foreground text-xs tabular-nums'>
            {t('progress.requirementProgress', {
              current: Math.min(requirement.current, requirement.target),
              target: requirement.target
            })}
          </p>
        </div>

        {!requirement.done && (
          <div className='mt-1.5 flex items-center gap-3'>
            <div
              role='progressbar'
              aria-valuemin={0}
              aria-valuemax={requirement.target}
              aria-valuenow={Math.min(requirement.current, requirement.target)}
              aria-label={label}
              className='bg-muted h-1.5 flex-1 overflow-hidden rounded-full'
            >
              <div
                className='bg-foreground/70 h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none'
                style={{ width: `${requirement.progressPct}%` }}
              />
            </div>

            {interactive && (
              <Link
                href={actionRoute(requirement.actionKey)}
                className='text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
              >
                {actionLabel}
                <IconArrowRight className='size-3' aria-hidden='true' />
              </Link>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
