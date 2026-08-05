'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import {
  IconArrowRight,
  IconCheck,
  IconCircle,
  IconInfoCircle,
  IconLoader2,
  IconLock
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useJourneyCopy } from '../lib/copy';
import {
  actionIcon,
  actionRoute,
  formatCents,
  nodeIcon,
  trackPresentation
} from '../lib/presentation';
import type { JourneyThread } from '../lib/threads';
import type { JourneyNode, JourneyOverview } from '../types';

/**
 * The body of the thread drawer, shared by the desktop sheet and the mobile
 * bottom sheet so the two can never drift.
 *
 * This is where the map's simplicity is paid for. The map shows one node per
 * thread on purpose — seven decisions, not twenty-seven — which only works if
 * opening one answers *every* question it raises: what this thread is for, what
 * it pays, what it takes, and what is left. So the whole checklist lives here,
 * grouped by step, with each requirement's real target and current value.
 *
 * Nothing on this screen is decided here. Statuses, targets, current values,
 * reward states and blockers all arrive from the server; this file groups them
 * and renders them.
 */
export function ThreadDetail({
  thread,
  data,
  onClaim,
  claimingNodeId
}: {
  thread: JourneyThread;
  data: JourneyOverview;
  onClaim: (nodeId: string) => void;
  claimingNodeId: string | null;
}) {
  const { t, dynamic } = useJourneyCopy();
  const locale = useLocale();

  const { track, steps } = thread;
  const presentation = trackPresentation(track.id);
  const TrackIcon = presentation.Icon;
  const name = dynamic(`track.${track.id}.name`, track.id);
  const description = dynamic(`track.${track.id}.description`, '');

  // The one thing to do next in this thread: the first unmet requirement of the
  // first step that is not blocked. A blocked step's action would send someone
  // to a screen that cannot help them yet.
  const actionable = steps.find(
    (step) => step.status !== 'achieved' && step.status !== 'locked'
  );
  const primaryAction =
    actionable?.requirements.find((r) => !r.done) ??
    actionable?.requirements[0];
  const ActionIcon = primaryAction
    ? actionIcon(primaryAction.actionKey)
    : IconArrowRight;

  return (
    <div className='flex flex-col gap-5'>
      <header className='flex items-start gap-3'>
        <span
          aria-hidden='true'
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            track.complete ? presentation.fill : presentation.tint
          )}
        >
          <TrackIcon
            className={cn(
              'size-5',
              track.complete ? 'text-white' : presentation.accent
            )}
          />
        </span>
        <div className='min-w-0 flex-1'>
          <h2 className='text-base leading-tight font-semibold'>{name}</h2>
          <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
            <Chip
              className={cn(
                track.mode === 'required'
                  ? 'bg-foreground/10 text-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {t(
                track.mode === 'required' ? 'track.required' : 'track.elective'
              )}
            </Chip>
            <Chip
              className={
                track.complete
                  ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300'
                  : 'bg-foreground/5 text-muted-foreground'
              }
            >
              {track.complete
                ? t('completion.trackComplete')
                : t('graph.trackNodes', {
                    completed: thread.stepsDone,
                    total: thread.stepsTotal
                  })}
            </Chip>
          </div>
          {description && (
            <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
              {description}
            </p>
          )}
        </div>
      </header>

      {/* What this thread is still worth, in one line. */}
      {thread.remainingCents > 0 && (
        <div
          className={cn(
            'rounded-xl border p-3',
            thread.claimableCents > 0
              ? 'border-emerald-600/30 bg-emerald-600/5'
              : 'bg-muted/50 border-transparent'
          )}
        >
          <p className='text-sm font-medium'>
            {t('thread.available', {
              amount: formatCents(thread.remainingCents, locale)
            })}
          </p>
          {thread.claimableCents > 0 && (
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('thread.claimableNow', {
                amount: formatCents(thread.claimableCents, locale)
              })}
            </p>
          )}
        </div>
      )}

      {/* The checklist. Every step, every requirement, with its real numbers. */}
      <section>
        <SectionTitle>{t('thread.steps')}</SectionTitle>
        <ol className='mt-2 flex flex-col gap-2'>
          {steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              data={data}
              onClaim={onClaim}
              claiming={claimingNodeId === step.id}
            />
          ))}
        </ol>
      </section>

      {/* One way forward, or the honest reason there is none yet. */}
      {thread.node.status === 'locked' ? (
        <div className='bg-muted/50 rounded-xl p-3'>
          <p className='flex items-start gap-2 text-sm'>
            <IconLock
              className='text-muted-foreground mt-0.5 size-4 shrink-0'
              aria-hidden='true'
            />
            <span>
              {t('status.blockedBy', {
                nodes: thread.node.blockedBy
                  .map((id) => dynamic(`track.${id}.name`, id))
                  .join(', ')
              })}
            </span>
          </p>
        </div>
      ) : (
        primaryAction && (
          <Link
            href={actionRoute(primaryAction.actionKey)}
            className='bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
          >
            <ActionIcon className='size-4' aria-hidden='true' />
            {dynamic(`action.${primaryAction.actionKey}`, t('nextAction.cta'))}
            <IconArrowRight className='size-4' aria-hidden='true' />
          </Link>
        )
      )}

      {track.mode === 'elective' && (
        <p className='text-muted-foreground flex items-start gap-2 text-xs leading-relaxed'>
          <IconInfoCircle
            className='mt-0.5 size-3.5 shrink-0'
            aria-hidden='true'
          />
          <span>{t('thread.electiveHint')}</span>
        </p>
      )}
    </div>
  );
}

/**
 * One step of a thread: its own state, its own money, and its own checks.
 *
 * Achieved steps collapse to a single line. Nobody needs to re-read the four
 * requirements of something they finished three weeks ago, and leaving them
 * expanded is what made the old per-node screens feel endless.
 */
function StepRow({
  step,
  data,
  onClaim,
  claiming
}: {
  step: JourneyNode;
  data: JourneyOverview;
  onClaim: (nodeId: string) => void;
  claiming: boolean;
}) {
  const { t, dynamic } = useJourneyCopy();

  const presentation = trackPresentation(step.track);
  const StepIcon = nodeIcon(step.id, step.track);
  const name = dynamic(`node.${step.id}.name`, step.id);
  const promise = dynamic(`node.${step.id}.promise`, '');

  const achieved = step.status === 'achieved';
  const locked = step.status === 'locked';

  return (
    <li
      className={cn(
        'rounded-xl border p-3',
        achieved
          ? 'border-emerald-600/25 bg-emerald-600/5'
          : locked
            ? 'bg-muted/30 border-dashed'
            : 'bg-card'
      )}
    >
      <div className='flex items-start gap-2.5'>
        <span
          aria-hidden='true'
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg',
            achieved
              ? 'bg-emerald-600 text-white'
              : locked
                ? 'bg-muted text-muted-foreground'
                : presentation.tint
          )}
        >
          {achieved ? (
            <IconCheck className='size-3.5' stroke={2.5} />
          ) : locked ? (
            <IconLock className='size-3' />
          ) : (
            <StepIcon className={cn('size-3.5', presentation.accent)} />
          )}
        </span>

        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
            <p className='text-sm font-medium'>{name}</p>
            {step.optional && (
              <Chip
                className='bg-muted text-muted-foreground'
                title={t('status.optionalHint')}
              >
                {t('status.optional')}
              </Chip>
            )}
          </div>

          {!achieved && promise && (
            <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
              {promise}
            </p>
          )}

          {/* The checks. Hidden once the step is done — it is done. */}
          {!achieved && step.requirements.length > 0 && (
            <ul
              aria-label={t('a11y.requirementList')}
              className='mt-2 flex flex-col gap-1.5'
            >
              {step.requirements.map((requirement) => (
                <li key={requirement.id} className='flex items-center gap-2'>
                  <span aria-hidden='true' className='shrink-0'>
                    {requirement.done ? (
                      <IconCheck
                        className='size-3.5 text-emerald-700 dark:text-emerald-400'
                        stroke={2.5}
                      />
                    ) : (
                      <IconCircle className='text-muted-foreground/40 size-3.5' />
                    )}
                  </span>
                  <span className='min-w-0 flex-1 text-xs'>
                    {dynamic(`requirement.${requirement.id}`, requirement.id)}
                    <span className='sr-only'>
                      {requirement.done ? t('a11y.done') : t('a11y.notDone')}
                    </span>
                  </span>
                  <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
                    {t('progress.requirementProgress', {
                      current: Math.min(
                        requirement.current,
                        requirement.target
                      ),
                      target: requirement.target
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {locked && step.blockedBy.length > 0 && (
            <p className='text-muted-foreground mt-2 text-xs'>
              {t('status.blockedBy', {
                nodes: step.blockedBy
                  .map((id) => dynamic(`node.${id}.name`, id))
                  .join(', ')
              })}
            </p>
          )}

          <StepReward
            step={step}
            data={data}
            onClaim={onClaim}
            claiming={claiming}
          />
        </div>
      </div>
    </li>
  );
}

/**
 * A step's money.
 *
 * Every state the server can report gets an explicit line. `legacy_claimed` in
 * particular must never render a claim button: the money moved under the
 * previous program and the endpoint would refuse, so offering it would be a
 * guaranteed dead end.
 */
function StepReward({
  step,
  data,
  onClaim,
  claiming
}: {
  step: JourneyNode;
  data: JourneyOverview;
  onClaim: (nodeId: string) => void;
  claiming: boolean;
}) {
  const { t, dynamic } = useJourneyCopy();
  const locale = useLocale();
  const reward = step.reward;

  if (!reward || reward.amountCents === 0) return null;
  const amount = formatCents(reward.amountCents, locale);

  if (reward.status === 'claimable' && data.program.rewardsAvailable) {
    return (
      <button
        type='button'
        onClick={() => onClaim(step.id)}
        disabled={claiming}
        className='bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60'
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

  const label =
    reward.status === 'claimed'
      ? `${amount} · ${t('reward.claimed')}`
      : reward.status === 'legacy_claimed'
        ? `${amount} · ${t('reward.legacyClaimed')}`
        : reward.status === 'pending_review'
          ? `${amount} · ${t('reward.pending')}`
          : reward.status === 'unavailable' || !data.program.rewardsAvailable
            ? `${amount} · ${
                data.program.rewardsBlockedReason
                  ? dynamic(
                      `reward.unavailableReason.${data.program.rewardsBlockedReason}`,
                      t('reward.unavailable')
                    )
                  : t('reward.unavailable')
              }`
            : t('reward.lockedLabel', { amount });

  return (
    <p
      className={cn(
        'mt-2 text-xs',
        reward.status === 'claimed' || reward.status === 'legacy_claimed'
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-muted-foreground'
      )}
    >
      {label}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
      {children}
    </h3>
  );
}

function Chip({
  children,
  className,
  title
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium',
        className
      )}
    >
      {children}
    </span>
  );
}
