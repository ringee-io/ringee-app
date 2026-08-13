'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconArrowRight,
  IconCircleCheck,
  IconCircleDashed,
  IconGift,
  IconLoader2,
  IconLock,
  IconSparkles
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { GroupLabel, Meter, Panel } from '../primitives';
import { formatUsd, type RewardTrackItem } from '../../lib/rewards';
import type { JourneyModel } from '../../lib/journey';
import type { JourneyClaimResult, JourneyRewardStatus } from '../../types';

/**
 * Rewards — real call credit, paid for progress.
 *
 * Every paying stage on the ladder is one card: reached stages can be redeemed
 * right here (the credit lands in the workspace wallet and pays for calls like
 * any top-up), and locked ones show the exact, live checklist that unlocks
 * them. The page never hand-waves: each requirement is a fact with a number
 * and a link to the screen where it gets done.
 */
export function RewardsSection({
  model,
  canAccessAdminFeatures
}: {
  model: JourneyModel;
  canAccessAdminFeatures: boolean;
}) {
  const track = model.rewards;
  const router = useRouter();
  const api = useApi();

  const [pendingStage, setPendingStage] = useState<string | null>(null);
  // Stages redeemed in this session — flips the card instantly while the
  // server-refreshed payload catches up.
  const [claimedNow, setClaimedNow] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const statusOf = (item: RewardTrackItem): JourneyRewardStatus =>
    claimedNow.has(item.stage.id) ? 'claimed' : item.status;

  const claimable = track.items.filter(
    (item) => statusOf(item) === 'claimable'
  );
  const claimableTotal = claimable.reduce((sum, r) => sum + r.amount, 0);
  const claimedTotal = track.totalPossible
    ? track.items
        .filter((item) => statusOf(item) === 'claimed')
        .reduce((sum, r) => sum + r.amount, 0)
    : 0;

  const claim = async (item: RewardTrackItem) => {
    if (pendingStage) return;
    setPendingStage(item.stage.id);
    try {
      const result = await api.post<JourneyClaimResult>(
        '/journey/rewards/claim',
        { stageId: item.stage.id }
      );
      setClaimedNow((prev) => new Set(prev).add(item.stage.id));
      if (result.claimed) {
        toast.success(`${formatUsd(item.amount)} added to your call credit`, {
          description: `${item.stage.name} reward redeemed — new balance ${formatUsd(result.balance)}.`
        });
      } else {
        toast.info('This reward was already redeemed.');
      }
      router.refresh();
    } catch {
      toast.error('Could not redeem this reward', {
        description: 'Please try again in a moment.'
      });
    } finally {
      setPendingStage(null);
    }
  };

  const claimAll = async () => {
    for (const item of claimable) {
      // Sequential on purpose: each claim is its own idempotent transaction.
      await claim(item);
    }
  };

  if (track.items.length === 0) {
    return (
      <Panel className='text-muted-foreground text-sm'>
        Rewards are not available right now — check back shortly.
      </Panel>
    );
  }

  return (
    <div className='space-y-7'>
      {/* ── How rewards work + what is waiting ──────────────────────────── */}
      <Panel className='relative overflow-hidden'>
        <div
          aria-hidden
          className='pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-emerald-500 opacity-10 blur-3xl'
        />
        <div className='relative flex flex-col gap-5 sm:flex-row sm:items-start'>
          <span className='flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
            <IconGift className='size-5' />
          </span>
          <div className='min-w-0 flex-1'>
            <h3 className='text-base font-semibold tracking-tight'>
              Grow your operation, earn call credit
            </h3>
            <p className='text-muted-foreground mt-1 max-w-2xl text-[13px] leading-relaxed'>
              Every stage you reach on your journey unlocks real call credit —{' '}
              {formatUsd(track.totalPossible)} across the whole path. Redeem a
              reward here and it lands straight in your wallet, spendable on
              calls like any top-up.
            </p>

            <ol className='text-muted-foreground mt-4 flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:gap-5'>
              {[
                'Hit the milestones below',
                'The stage unlocks its reward',
                'Redeem it into your wallet'
              ].map((step, i) => (
                <li key={step} className='flex items-center gap-2'>
                  <span className='bg-muted text-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold'>
                    {i + 1}
                  </span>
                  {step}
                  {i < 2 ? (
                    <IconArrowRight className='text-muted-foreground/50 ml-1 hidden size-3.5 sm:block' />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <div className='w-full shrink-0 sm:w-52 sm:text-right'>
            <p className='text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase'>
              Ready to redeem
            </p>
            <p
              className={cn(
                'mt-0.5 text-3xl font-semibold tracking-tight tabular-nums',
                claimableTotal > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-foreground'
              )}
            >
              {formatUsd(claimableTotal)}
            </p>
            <div className='mt-3'>
              <div className='mb-1.5 flex items-baseline justify-between gap-2'>
                <span className='text-muted-foreground text-[11px]'>
                  Earned
                </span>
                <span className='text-xs font-medium tabular-nums'>
                  {formatUsd(claimedTotal)} of {formatUsd(track.totalPossible)}
                </span>
              </div>
              <Meter
                value={
                  track.totalPossible > 0
                    ? (claimedTotal / track.totalPossible) * 100
                    : 0
                }
                tone='bg-emerald-500'
              />
            </div>
            {claimable.length > 1 && canAccessAdminFeatures ? (
              <button
                type='button'
                onClick={claimAll}
                disabled={pendingStage !== null}
                className='mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60'
              >
                {pendingStage ? (
                  <IconLoader2 className='size-3.5 animate-spin' />
                ) : (
                  <IconGift className='size-3.5' />
                )}
                Redeem all {formatUsd(claimableTotal)}
              </button>
            ) : null}
          </div>
        </div>
      </Panel>

      {!canAccessAdminFeatures ? (
        <p className='text-muted-foreground -mt-3 text-xs'>
          Rewards are redeemed into the organization wallet by a workspace admin
          — you can still see what is unlocked and what is next.
        </p>
      ) : null}

      {/* ── The track ───────────────────────────────────────────────────── */}
      <section>
        <GroupLabel>Your reward path</GroupLabel>
        <div className='space-y-3'>
          {track.items.map((item) => (
            <RewardCard
              key={item.stage.id}
              item={item}
              status={statusOf(item)}
              pending={pendingStage === item.stage.id}
              canAccessAdminFeatures={canAccessAdminFeatures}
              onClaim={() => claim(item)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function RewardCard({
  item,
  status,
  pending,
  canAccessAdminFeatures,
  onClaim
}: {
  item: RewardTrackItem;
  status: JourneyRewardStatus;
  pending: boolean;
  canAccessAdminFeatures: boolean;
  onClaim: () => void;
}) {
  const { stage } = item;
  const Icon = stage.Icon;
  const claimed = status === 'claimed';
  const claimable = status === 'claimable';

  return (
    <Panel
      className={cn(
        'transition-colors',
        claimable && 'border-emerald-500/40 ring-1 ring-emerald-500/20'
      )}
    >
      <div className='flex flex-wrap items-center gap-3'>
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            claimed ? 'bg-emerald-500/10' : stage.tint,
            claimed ? 'text-emerald-600 dark:text-emerald-400' : stage.accent
          )}
        >
          {claimed ? (
            <IconCircleCheck className='size-5' />
          ) : (
            <Icon className='size-5' />
          )}
        </span>

        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <p className='text-sm font-semibold tracking-tight'>{stage.name}</p>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                claimed
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              )}
            >
              +{formatUsd(item.amount)} credit
            </span>
          </div>
          <p className='text-muted-foreground mt-0.5 text-xs'>
            {claimed
              ? `Redeemed${item.claimedAt ? ` on ${formatDate(item.claimedAt)}` : ''} — the credit is in your wallet.`
              : claimable
                ? 'Stage reached — this reward is ready to redeem.'
                : `Complete ${item.total - item.completed} more ${item.total - item.completed === 1 ? 'milestone' : 'milestones'} to unlock.`}
          </p>
        </div>

        {claimable ? (
          canAccessAdminFeatures ? (
            <button
              type='button'
              onClick={onClaim}
              disabled={pending}
              className='inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60'
            >
              {pending ? (
                <IconLoader2 className='size-3.5 animate-spin' />
              ) : (
                <IconSparkles className='size-3.5' />
              )}
              Redeem {formatUsd(item.amount)}
            </button>
          ) : (
            <span className='text-muted-foreground shrink-0 text-[11px]'>
              An admin can redeem this
            </span>
          )
        ) : !claimed ? (
          <span className='text-muted-foreground/70 flex shrink-0 items-center gap-1.5 text-[11px]'>
            <IconLock className='size-3.5' />
            {item.completed} of {item.total} done
          </span>
        ) : null}
      </div>

      {/* The unlock checklist — only while there is something left to do. */}
      {!claimed && !claimable && item.requirements.length > 0 ? (
        <div className='mt-4 border-t pt-3'>
          <ul className='space-y-2'>
            {item.requirements.map((req) => {
              const showAction =
                req.action &&
                !req.done &&
                (canAccessAdminFeatures || !req.action.adminOnly);

              return (
                <li
                  key={req.id}
                  className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'
                >
                  {req.done ? (
                    <IconCircleCheck className='size-4 shrink-0 text-emerald-500' />
                  ) : (
                    <IconCircleDashed className='text-muted-foreground/60 size-4 shrink-0' />
                  )}
                  <span
                    className={cn(
                      'min-w-0',
                      req.done
                        ? 'text-muted-foreground line-through decoration-emerald-500/40'
                        : 'text-foreground'
                    )}
                  >
                    {req.label}
                  </span>
                  <span className='text-muted-foreground/70 text-[11px]'>
                    {req.detail}
                  </span>
                  {showAction && req.action ? (
                    <Link
                      href={req.action.href}
                      className='text-primary ml-auto inline-flex items-center gap-0.5 text-[11px] font-medium hover:underline'
                    >
                      {req.action.label}
                      <IconArrowRight className='size-3' />
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {item.total > 1 ? (
            <Meter
              value={(item.completed / item.total) * 100}
              tone={stage.solid}
              className='mt-3'
            />
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
