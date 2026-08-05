'use client';

import { useLocale } from 'next-intl';
import { IconCheck, IconLock, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useJourneyCopy } from '../lib/copy';
import { formatCents, stagePresentation } from '../lib/presentation';
import { RequirementRow } from './requirement-row';
import type { JourneyStage } from '../types';

/**
 * One stage of the ladder.
 *
 * Answers, in order, the six questions a stage has to answer: what you will
 * learn, why it is worth doing, what is still missing, how far along you are,
 * what to do next, and what you get. Achieved stages collapse to a single line
 * with the date — the page is about what is next, not a trophy cabinet.
 */
export function StageCard({
  stage,
  isCurrent,
  rewardsAvailable,
  rewardsBlockedReason,
  onClaim,
  claiming
}: {
  stage: JourneyStage;
  isCurrent: boolean;
  rewardsAvailable: boolean;
  rewardsBlockedReason: string | null;
  onClaim: (stageId: string) => void;
  claiming: boolean;
}) {
  const { t, dynamic } = useJourneyCopy();
  const locale = useLocale();
  const { Icon, accent, tint, ring } = stagePresentation(stage.id);

  const name = dynamic(`stage.${stage.id}.name`, stage.id);
  const promise = dynamic(`stage.${stage.id}.promise`, '');
  const value = dynamic(`stage.${stage.id}.value`, '');
  const locked = stage.status === 'locked';
  const achieved = stage.status === 'achieved';

  return (
    <li>
      <article
        aria-labelledby={`journey-stage-${stage.id}`}
        className={cn(
          'rounded-2xl border transition-colors',
          isCurrent ? `bg-card ring-1 ${ring}` : 'bg-card/50',
          locked && 'opacity-70'
        )}
      >
        <div className='flex items-start gap-4 p-4 sm:p-5'>
          <span
            aria-hidden='true'
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl',
              achieved ? 'bg-emerald-600/15' : tint
            )}
          >
            {achieved ? (
              <IconCheck
                className='size-5 text-emerald-700 dark:text-emerald-400'
                stroke={2.5}
              />
            ) : locked ? (
              <IconLock className='text-muted-foreground size-4' />
            ) : (
              <Icon className={cn('size-5', accent)} />
            )}
          </span>

          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
              <h3
                id={`journey-stage-${stage.id}`}
                className='text-sm font-semibold'
              >
                {name}
              </h3>
              <StatusChip status={stage.status} />
              {stage.reward && (
                <RewardChip
                  amountCents={stage.reward.amountCents}
                  status={stage.reward.status}
                  locale={locale}
                />
              )}
            </div>

            {promise && (
              <p className='text-muted-foreground mt-1 text-sm'>{promise}</p>
            )}

            {achieved ? (
              <p className='text-muted-foreground mt-2 text-xs'>
                {stage.achievedAt
                  ? new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium'
                    }).format(new Date(stage.achievedAt))
                  : null}
              </p>
            ) : (
              <>
                {value && isCurrent && (
                  <p className='text-muted-foreground mt-2 text-xs leading-relaxed'>
                    {value}
                  </p>
                )}

                <p className='text-muted-foreground mt-3 text-xs font-medium'>
                  {t('progress.label', {
                    completed: stage.completed,
                    total: stage.total
                  })}
                </p>

                <ul
                  aria-label={t('a11y.requirementList')}
                  className='divide-border/60 mt-1 divide-y'
                >
                  {stage.requirements.map((requirement) => (
                    <RequirementRow
                      key={requirement.id}
                      requirement={requirement}
                      interactive={!locked}
                    />
                  ))}
                </ul>

                {locked && (
                  <p className='text-muted-foreground mt-2 text-xs'>
                    {t('status.lockedHint')}
                  </p>
                )}
              </>
            )}

            {stage.reward && (
              <StageRewardAction
                stage={stage}
                rewardsAvailable={rewardsAvailable}
                rewardsBlockedReason={rewardsBlockedReason}
                onClaim={onClaim}
                claiming={claiming}
              />
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

function StatusChip({ status }: { status: JourneyStage['status'] }) {
  const { t } = useJourneyCopy();
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium',
        status === 'achieved' &&
          'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300',
        status === 'in_progress' && 'bg-foreground/10 text-foreground',
        status === 'locked' && 'bg-muted text-muted-foreground'
      )}
    >
      {t(`status.${status}` as never)}
    </span>
  );
}

function RewardChip({
  amountCents,
  status,
  locale
}: {
  amountCents: number;
  status: NonNullable<JourneyStage['reward']>['status'];
  locale: string;
}) {
  const { t } = useJourneyCopy();
  const amount = formatCents(amountCents, locale);

  if (status === 'claimed') {
    return (
      <span className='text-muted-foreground text-[11px] font-medium'>
        {t('reward.claimed')} · {amount}
      </span>
    );
  }
  if (status === 'pending_review') {
    return (
      <span className='rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300'>
        {t('reward.pending')}
      </span>
    );
  }
  return (
    <span className='text-muted-foreground text-[11px] font-medium tabular-nums'>
      {amount}
    </span>
  );
}

/**
 * The redeem control.
 *
 * Rendered only when the backend says the reward is claimable. Every other
 * state (paused program, exhausted budget, holdout, under review, rejected)
 * gets an explanatory line instead of a disabled button that says nothing.
 */
function StageRewardAction({
  stage,
  rewardsAvailable,
  rewardsBlockedReason,
  onClaim,
  claiming
}: {
  stage: JourneyStage;
  rewardsAvailable: boolean;
  rewardsBlockedReason: string | null;
  onClaim: (stageId: string) => void;
  claiming: boolean;
}) {
  const { t, dynamic } = useJourneyCopy();
  const locale = useLocale();
  const reward = stage.reward;
  if (!reward) return null;

  const amount = formatCents(reward.amountCents, locale);

  if (reward.status === 'claimable' && rewardsAvailable) {
    return (
      <button
        type='button'
        onClick={() => onClaim(stage.id)}
        disabled={claiming}
        className='bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60'
      >
        {claiming && (
          <IconLoader2
            className='size-3.5 animate-spin motion-reduce:animate-none'
            aria-hidden='true'
          />
        )}
        {claiming ? t('reward.claiming') : t('reward.claim', { amount })}
      </button>
    );
  }

  if (
    reward.status === 'unavailable' ||
    (!rewardsAvailable && stage.status === 'achieved')
  ) {
    return (
      <p className='text-muted-foreground mt-3 text-xs'>
        {rewardsBlockedReason
          ? dynamic(
              `reward.unavailableReason.${rewardsBlockedReason}`,
              t('reward.unavailable')
            )
          : t('reward.unavailable')}
      </p>
    );
  }

  if (reward.status === 'pending_review') {
    return (
      <p className='text-muted-foreground mt-3 text-xs'>
        {t('claim.pending_review')}
      </p>
    );
  }

  if (reward.status === 'rejected') {
    return (
      <p className='text-muted-foreground mt-3 text-xs'>
        {t('claim.needs_more_activity')}
      </p>
    );
  }

  if (reward.status === 'claimed' && reward.claimedAt) {
    return (
      <p className='text-muted-foreground mt-3 text-xs'>
        {t('reward.claimedOn', {
          date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
            new Date(reward.claimedAt)
          )
        })}
      </p>
    );
  }

  return (
    <p className='text-muted-foreground mt-3 text-xs'>
      {t('reward.lockedLabel', { amount })}
    </p>
  );
}
