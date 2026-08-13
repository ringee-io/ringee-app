import Link from 'next/link';
import { IconArrowRight, IconCircleCheck } from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Panel } from './primitives';
import type { JourneyStep } from '../lib/journey';

/**
 * The action centre. These are the highest-leverage unmet milestones, in order,
 * and every one of them links to the place in Ringee where it actually gets
 * done — so direction turns straight into action.
 */
export function NextSteps({ steps }: { steps: JourneyStep[] }) {
  if (steps.length === 0) {
    return (
      <Panel className='flex items-center gap-3'>
        <span className='flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
          <IconCircleCheck className='size-5' />
        </span>
        <div>
          <p className='text-sm font-medium'>You are in great shape</p>
          <p className='text-muted-foreground text-xs'>
            Nothing is blocking you right now — keep calling and keep an eye on
            your numbers.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <div className='grid gap-3 sm:grid-cols-2'>
      {steps.map((step, index) => {
        const Icon = step.Icon;
        return (
          <Panel key={step.id} className='flex flex-col gap-3'>
            <div className='flex items-start gap-3'>
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
                </div>
                <p className='text-muted-foreground mt-1 text-[12px] leading-relaxed'>
                  {step.description}
                </p>
              </div>
            </div>
            <Link
              href={step.action.href}
              className='text-muted-foreground hover:border-foreground/20 hover:text-foreground group inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-medium transition-colors'
            >
              {step.action.label}
              <IconArrowRight className='size-3.5 transition-transform group-hover:translate-x-0.5' />
            </Link>
          </Panel>
        );
      })}
    </div>
  );
}
