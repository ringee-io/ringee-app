import { IconCheck, IconGift } from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Panel } from './primitives';
import { formatUsd } from '../lib/rewards';
import type { JourneyModel } from '../lib/journey';
import type { JourneySection } from './journey-sections';

/**
 * The path itself. Which ladder is shown depends on the workspace: an
 * organization climbs through team, campaigns and scale; a freelancer climbs
 * through consistency, an integrated stack and agents. Nobody is shown a rung
 * they cannot reach.
 *
 * Stages that pay a reward carry a credit chip under the node, so the money on
 * the path is visible at a glance: earned (check), ready to redeem
 * (highlighted — tapping it opens the Rewards view), or still ahead (muted).
 */
export function StagePath({
  model,
  onNavigate
}: {
  model: JourneyModel;
  onNavigate?: (section: JourneySection) => void;
}) {
  const { ladder, stageIndex } = model;
  const last = ladder.length - 1;

  return (
    <Panel>
      <div className='flex items-start'>
        {ladder.map((stage, i) => {
          const Icon = stage.Icon;
          const done = i < stageIndex;
          const current = i === stageIndex;
          const reward = model.rewards.byStage[stage.id];

          return (
            <div
              key={stage.id}
              className='relative flex min-w-0 flex-1 flex-col items-center'
            >
              {/* Connector into this node. */}
              {i > 0 ? (
                <span
                  className={cn(
                    'absolute top-5 right-1/2 left-0 h-0.5',
                    i <= stageIndex ? stage.solid : 'bg-border'
                  )}
                />
              ) : null}
              {/* Connector out of this node. */}
              {i < last ? (
                <span
                  className={cn(
                    'absolute top-5 right-0 left-1/2 h-0.5',
                    i < stageIndex ? ladder[i + 1].solid : 'bg-border'
                  )}
                />
              ) : null}

              <span
                className={cn(
                  'relative z-10 flex size-10 items-center justify-center rounded-full ring-1',
                  done && cn(stage.solid, 'text-white ring-black/5'),
                  current &&
                    cn(
                      stage.tint,
                      stage.accent,
                      'shadow-sm ring-2',
                      stage.ring
                    ),
                  !done &&
                    !current &&
                    'bg-muted text-muted-foreground/70 ring-border'
                )}
              >
                {done ? (
                  <IconCheck className='size-5' />
                ) : (
                  <Icon className='size-5' />
                )}
              </span>

              <div className='mt-2 px-1 text-center'>
                <p
                  className={cn(
                    'truncate text-[11px] font-medium',
                    current
                      ? 'text-foreground'
                      : done
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/60'
                  )}
                  title={stage.name}
                >
                  {stage.name}
                </p>
                <p
                  className={cn(
                    'mt-0.5 hidden truncate text-[10px] sm:block',
                    current ? stage.accent : 'text-muted-foreground/50'
                  )}
                >
                  {current ? 'You are here' : stage.focus}
                </p>

                {reward ? (
                  <button
                    type='button'
                    onClick={
                      onNavigate ? () => onNavigate('rewards') : undefined
                    }
                    title={
                      reward.status === 'claimed'
                        ? `${formatUsd(reward.amount)} credit redeemed`
                        : reward.status === 'claimable'
                          ? `${formatUsd(reward.amount)} credit ready to redeem`
                          : `Reach this stage to unlock ${formatUsd(reward.amount)} credit`
                    }
                    className={cn(
                      'mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums transition-colors',
                      reward.status === 'claimed' &&
                        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                      reward.status === 'claimable' &&
                        'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
                      reward.status === 'locked' &&
                        'bg-muted text-muted-foreground/70 hover:text-muted-foreground'
                    )}
                  >
                    {reward.status === 'claimed' ? (
                      <IconCheck className='size-3' />
                    ) : (
                      <IconGift className='size-3' />
                    )}
                    {formatUsd(reward.amount)}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
