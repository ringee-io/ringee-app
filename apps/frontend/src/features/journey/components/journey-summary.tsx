'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import {
  IconArrowRight,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader2,
  IconWallet
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useJourneyCopy } from '../lib/copy';
import {
  actionIcon,
  actionRoute,
  formatCents,
  stagePresentation
} from '../lib/presentation';
import type { JourneyOverview } from '../types';

/**
 * The header: where the workspace is, the single next action, and the credit
 * position — the three things the page exists to answer above the fold.
 */
export function JourneySummary({
  data,
  onClaimAll,
  claimingAll,
  onNextActionClick
}: {
  data: JourneyOverview;
  onClaimAll: () => void;
  claimingAll: boolean;
  onNextActionClick: () => void;
}) {
  const { t, dynamic } = useJourneyCopy();
  const locale = useLocale();

  const current = data.stages.find((s) => s.id === data.currentStageId);
  const presentation = stagePresentation(data.currentStageId ?? '');
  const next = data.nextRequirement;
  const NextIcon = next ? actionIcon(next.actionKey) : IconArrowRight;

  return (
    <section className='grid gap-4 lg:grid-cols-3'>
      {/* Where you are */}
      <div className='bg-card rounded-2xl border p-5 lg:col-span-2'>
        <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
          {data.completed ? t('current.completeHeading') : t('current.heading')}
        </p>

        {data.completed || !current ? (
          <>
            <h2 className='mt-2 flex items-center gap-2 text-lg font-semibold'>
              <IconCircleCheck
                className='size-5 text-emerald-700 dark:text-emerald-400'
                aria-hidden='true'
              />
              {t('current.completeHeading')}
            </h2>
            <p className='text-muted-foreground mt-1.5 text-sm leading-relaxed'>
              {t('current.completeBody')}
            </p>
          </>
        ) : (
          <>
            <h2 className='mt-2 flex items-center gap-2.5 text-lg font-semibold'>
              <span
                aria-hidden='true'
                className={cn(
                  'flex size-8 items-center justify-center rounded-lg',
                  presentation.tint
                )}
              >
                <presentation.Icon
                  className={cn('size-4', presentation.accent)}
                />
              </span>
              {dynamic(`stage.${current.id}.name`, current.id)}
            </h2>
            <p className='text-muted-foreground mt-1.5 text-sm leading-relaxed'>
              {dynamic(`stage.${current.id}.promise`, '')}
            </p>

            <div className='mt-4 flex items-center gap-3'>
              <div
                role='progressbar'
                aria-valuemin={0}
                aria-valuemax={current.total}
                aria-valuenow={current.completed}
                aria-label={t('progress.stageProgress', {
                  percent: current.progressPct
                })}
                className='bg-muted h-2 flex-1 overflow-hidden rounded-full'
              >
                <div
                  className='bg-foreground h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none'
                  style={{ width: `${current.progressPct}%` }}
                />
              </div>
              <span className='text-muted-foreground text-xs font-medium tabular-nums'>
                {t('progress.label', {
                  completed: current.completed,
                  total: current.total
                })}
              </span>
            </div>
          </>
        )}

        {next && (
          <div className='bg-muted/50 mt-5 rounded-xl p-4'>
            <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
              {t('nextAction.heading')}
            </p>
            <div className='mt-2 flex flex-wrap items-center justify-between gap-3'>
              <p className='flex items-center gap-2 text-sm font-medium'>
                <NextIcon
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
                {dynamic(`requirement.${next.id}`, next.id)}
                <span className='text-muted-foreground font-normal tabular-nums'>
                  ·{' '}
                  {t('progress.requirementProgress', {
                    current: Math.min(next.current, next.target),
                    target: next.target
                  })}
                </span>
              </p>
              <Link
                href={actionRoute(next.actionKey)}
                onClick={onNextActionClick}
                className='bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
              >
                {dynamic(`action.${next.actionKey}`, t('nextAction.cta'))}
                <IconArrowRight className='size-3.5' aria-hidden='true' />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Credit */}
      <div className='bg-card flex flex-col rounded-2xl border p-5'>
        <p className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase'>
          <IconWallet className='size-3.5' aria-hidden='true' />
          {t('reward.heading')}
        </p>

        <p className='mt-2 text-2xl font-semibold tabular-nums'>
          {new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'USD'
          }).format(data.balance)}
        </p>
        <p className='text-muted-foreground text-xs'>{t('reward.available')}</p>

        <dl className='mt-4 space-y-1.5 text-xs'>
          <Row
            label={t('reward.claimed')}
            value={formatCents(data.totals.claimedCents, locale)}
          />
          {data.totals.pendingReviewCents > 0 && (
            <Row
              label={t('reward.pending')}
              value={formatCents(data.totals.pendingReviewCents, locale)}
            />
          )}
          <Row
            label={t('reward.possible')}
            value={formatCents(data.totals.possibleCents, locale)}
          />
        </dl>

        {data.totals.claimableCents > 0 && data.program.rewardsAvailable ? (
          <button
            type='button'
            onClick={onClaimAll}
            disabled={claimingAll}
            className='bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring mt-4 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60'
          >
            {claimingAll && (
              <IconLoader2
                className='size-3.5 animate-spin motion-reduce:animate-none'
                aria-hidden='true'
              />
            )}
            {claimingAll
              ? t('reward.claiming')
              : t('reward.claimAll', {
                  amount: formatCents(data.totals.claimableCents, locale)
                })}
          </button>
        ) : (
          !data.program.rewardsAvailable &&
          data.program.rewardsBlockedReason && (
            <p className='text-muted-foreground mt-4 flex items-start gap-1.5 text-xs leading-relaxed'>
              <IconInfoCircle
                className='mt-0.5 size-3.5 shrink-0'
                aria-hidden='true'
              />
              {dynamic(
                `reward.unavailableReason.${data.program.rewardsBlockedReason}`,
                t('reward.unavailable')
              )}
            </p>
          )
        )}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-baseline justify-between gap-2'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='font-medium tabular-nums'>{value}</dd>
    </div>
  );
}
