import { IconCheck } from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Panel } from './primitives';
import type { JourneyModel } from '../lib/journey';

/**
 * The path itself. Which ladder is shown depends on the workspace: an
 * organization climbs through team, campaigns and scale; a freelancer climbs
 * through consistency, an integrated stack and agents. Nobody is shown a rung
 * they cannot reach.
 */
export function StagePath({ model }: { model: JourneyModel }) {
  const { ladder, stageIndex } = model;
  const last = ladder.length - 1;

  return (
    <Panel>
      <div className='flex items-start'>
        {ladder.map((stage, i) => {
          const Icon = stage.Icon;
          const done = i < stageIndex;
          const current = i === stageIndex;

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
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
