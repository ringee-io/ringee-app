import Link from 'next/link';
import {
  IconCircleCheckFilled,
  IconCircleDashed,
  IconChevronRight
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Meter, Panel } from './primitives';
import type { JourneyPillar } from '../lib/journey';

/**
 * The detail behind the score: every milestone the journey looks at, grouped,
 * with the live number next to it. This is what makes the page trustworthy —
 * nothing about the stage is a black box.
 */
export function PillarsPanel({
  pillars,
  canAccessAdminFeatures
}: {
  pillars: JourneyPillar[];
  canAccessAdminFeatures: boolean;
}) {
  return (
    <div className='grid gap-3 lg:grid-cols-2'>
      {pillars.map((pillar) => {
        const Icon = pillar.Icon;
        return (
          <Panel key={pillar.id} className='flex flex-col'>
            <div className='flex items-start gap-3'>
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl',
                  pillar.tint,
                  pillar.accent
                )}
              >
                <Icon className='size-5' />
              </span>
              <div className='min-w-0 flex-1'>
                <div className='flex items-baseline justify-between gap-2'>
                  <p className='truncate text-sm font-semibold tracking-tight'>
                    {pillar.name}
                  </p>
                  <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
                    {pillar.completed}/{pillar.total}
                  </span>
                </div>
                <p className='text-muted-foreground truncate text-[11px]'>
                  {pillar.description}
                </p>
              </div>
            </div>

            <Meter
              value={pillar.score}
              tone={pillar.solid}
              className='mt-3.5'
            />

            <ul className='mt-3.5 space-y-0.5'>
              {pillar.criteria.map((criterion) => {
                const actionable =
                  criterion.action &&
                  !criterion.done &&
                  (canAccessAdminFeatures || !criterion.action.adminOnly);

                const row = (
                  <>
                    {criterion.done ? (
                      <IconCircleCheckFilled className='size-4 shrink-0 text-emerald-500' />
                    ) : (
                      <IconCircleDashed className='text-muted-foreground/50 size-4 shrink-0' />
                    )}
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[13px]',
                        criterion.done
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                      )}
                    >
                      {criterion.label}
                    </span>
                    <span className='text-muted-foreground/70 shrink-0 text-[11px] tabular-nums'>
                      {criterion.detail}
                    </span>
                    {actionable ? (
                      <IconChevronRight className='text-muted-foreground/50 size-3.5 shrink-0' />
                    ) : null}
                  </>
                );

                return (
                  <li key={criterion.id}>
                    {actionable ? (
                      <Link
                        href={criterion.action!.href}
                        className='hover:bg-accent/50 flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors'
                        title={criterion.why}
                      >
                        {row}
                      </Link>
                    ) : (
                      <div
                        className='flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5'
                        title={criterion.why}
                      >
                        {row}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
