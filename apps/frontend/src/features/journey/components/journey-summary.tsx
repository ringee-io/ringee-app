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
import { actionIcon, actionRoute, formatCents } from '../lib/presentation';
import type { JourneyOverview } from '../types';

/**
 * The header: how far the workspace is, the single next action, and the credit
 * position — the three things the page has to answer above the fold.
 *
 * Completion is expressed as "Core, plus N of M elective tracks" rather than a
 * single percentage, because a percentage would imply there is one path and the
 * workspace is behind on it. There isn't, and it usually isn't.
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

  const { completion } = data;
  const next = data.recommendedRequirement;
  const recommended = data.nodes.find((n) => n.id === data.recommendedNodeId);
  const NextIcon = next ? actionIcon(next.actionKey) : IconArrowRight;

  const coreTrack = data.tracks.find((track) => track.mode === 'required');
  const electiveRemaining = Math.max(
    0,
    completion.electiveRequired - completion.electiveComplete
  );

  return (
    <section className='grid gap-4 lg:grid-cols-3'>
      <div className='bg-card rounded-2xl border p-5 lg:col-span-2'>
        <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
          {t('completion.heading')}
        </p>

        {completion.complete ? (
          <>
            <h2 className='mt-2 flex items-center gap-2 text-lg font-semibold'>
              <IconCircleCheck
                className='size-5 text-emerald-700 dark:text-emerald-400'
                aria-hidden='true'
              />
              {t('completion.done')}
            </h2>
            <p className='text-muted-foreground mt-1.5 text-sm leading-relaxed'>
              {t('completion.doneBody', {
                count: completion.electiveComplete
              })}
            </p>
          </>
        ) : (
          <>
            <div className='mt-3 grid gap-3 sm:grid-cols-2'>
              <Meter
                label={t('completion.coreHeading')}
                value={coreTrack?.satisfied ?? 0}
                total={coreTrack?.needed ?? 1}
                done={Boolean(coreTrack?.complete)}
              />
              <Meter
                label={t('completion.electiveHeading')}
                value={completion.electiveComplete}
                total={completion.electiveRequired}
                done={
                  completion.electiveComplete >= completion.electiveRequired
                }
                caption={t('completion.electiveProgress', {
                  completed: completion.electiveComplete,
                  required: completion.electiveRequired
                })}
              />
            </div>

            {/*
              Says out loud that skipping a track is a choice, not a gap. Without
              this line a half-empty graph reads as failure.
            */}
            <p className='text-muted-foreground mt-3 text-xs leading-relaxed'>
              {t('completion.explainer', {
                count: completion.electiveRequired
              })}
            </p>

            {electiveRemaining > 0 && coreTrack?.complete && (
              <p className='mt-1 text-xs font-medium'>
                {electiveRemaining === 1
                  ? t('completion.electiveRemaining', {
                      count: electiveRemaining
                    })
                  : t('completion.electiveRemainingPlural', {
                      count: electiveRemaining
                    })}
              </p>
            )}
          </>
        )}

        {next && recommended && (
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
            value={formatCents(
              data.totals.claimedCents + data.totals.legacyClaimedCents,
              locale
            )}
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

function Meter({
  label,
  value,
  total,
  done,
  caption
}: {
  label: string;
  value: number;
  total: number;
  done: boolean;
  caption?: string;
}) {
  const percent =
    total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;

  return (
    <div>
      <div className='flex items-baseline justify-between gap-2'>
        <p className='text-sm font-medium'>{label}</p>
        {done && (
          <IconCircleCheck
            className='size-4 shrink-0 text-emerald-700 dark:text-emerald-400'
            aria-hidden='true'
          />
        )}
      </div>
      <div
        role='progressbar'
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
        aria-label={label}
        className='bg-muted mt-1.5 h-2 overflow-hidden rounded-full'
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none',
            done ? 'bg-emerald-600' : 'bg-foreground'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className='text-muted-foreground mt-1 text-xs tabular-nums'>
        {caption ?? `${value}/${total}`}
      </p>
    </div>
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
