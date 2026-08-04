import Link from 'next/link';
import {
  IconArrowRight,
  IconCircleCheck,
  IconLock,
  IconSparkles
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { GroupLabel, Panel } from '../primitives';
import type { JourneyModel } from '../../lib/journey';

/**
 * What to do next — the full, ordered list of open work, not just the headline
 * four. Order is by leverage: the thing that unblocks the most comes first.
 * Anything a plain member cannot do themselves is listed separately instead of
 * being hidden, so nobody is left wondering why their journey is stuck.
 */
export function ActionsSection({ model }: { model: JourneyModel }) {
  return (
    <div className='space-y-7'>
      {model.allSteps.length === 0 ? (
        <Panel className='flex items-center gap-3'>
          <span className='flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
            <IconCircleCheck className='size-5' />
          </span>
          <div>
            <p className='text-sm font-medium'>Nothing open right now</p>
            <p className='text-muted-foreground text-xs'>
              Every milestone we track is met. Keep calling — the next stage
              comes from volume and results, not setup.
            </p>
          </div>
        </Panel>
      ) : (
        <section>
          <GroupLabel>
            {model.allSteps.length} open · ordered by impact
          </GroupLabel>
          <div className='space-y-2'>
            {model.allSteps.map((step, index) => {
              const Icon = step.Icon;
              const headline = index < 2;

              return (
                <Panel
                  key={step.id}
                  className={cn(
                    'flex flex-col gap-3 sm:flex-row sm:items-center',
                    headline && 'ring-primary/15 ring-1'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-xl',
                      step.tint,
                      step.accent
                    )}
                  >
                    <Icon className='size-5' />
                  </span>

                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <span className='text-muted-foreground/60 text-[11px] font-medium tabular-nums'>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <p className='truncate text-sm font-semibold tracking-tight'>
                        {step.title}
                      </p>
                      {headline ? (
                        <span className='bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium'>
                          <IconSparkles className='size-2.5' />
                          Highest impact
                        </span>
                      ) : null}
                    </div>
                    <p className='text-muted-foreground mt-1 text-[12px] leading-relaxed'>
                      {step.description}
                    </p>
                  </div>

                  <Link
                    href={step.action.href}
                    className='text-muted-foreground hover:border-foreground/20 hover:text-foreground group inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:self-center'
                  >
                    {step.action.label}
                    <IconArrowRight className='size-3.5 transition-transform group-hover:translate-x-0.5' />
                  </Link>
                </Panel>
              );
            })}
          </div>
        </section>
      )}

      {model.blockedSteps.length > 0 ? (
        <section>
          <GroupLabel>Needs a workspace admin</GroupLabel>
          <Panel>
            <p className='text-muted-foreground mb-3 text-xs'>
              These would move your workspace forward, but only an admin can set
              them up.
            </p>
            <ul className='space-y-1.5'>
              {model.blockedSteps.map((item) => (
                <li key={item.id} className='flex items-center gap-2.5'>
                  <IconLock className='text-muted-foreground/50 size-3.5 shrink-0' />
                  <span className='text-foreground min-w-0 flex-1 truncate text-[13px]'>
                    {item.label}
                  </span>
                  <span className='text-muted-foreground/70 shrink-0 text-[11px]'>
                    {item.detail}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}
