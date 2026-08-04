import {
  IconArrowRight,
  IconCircleCheck,
  IconCircleDashed
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { GroupLabel, Meter, Panel } from '../primitives';
import { HighlightsRow } from '../highlights-row';
import { NextSteps } from '../next-steps';
import type { JourneyModel } from '../../lib/journey';
import type { JourneySection } from '../journey-sections';

/**
 * Overview — the short version. Enough to know whether things are on track and
 * what the one next move is; every deeper question has its own section, linked
 * from here rather than crammed in.
 */
export function OverviewSection({
  model,
  onNavigate
}: {
  model: JourneyModel;
  onNavigate: (section: JourneySection) => void;
}) {
  return (
    <div className='space-y-7'>
      <section>
        <GroupLabel>Last {model.windowDays} days</GroupLabel>
        <HighlightsRow highlights={model.highlights} />
      </section>

      <section>
        <div className='mb-2.5 flex items-end justify-between gap-4'>
          <GroupLabel className='mb-0'>Start here</GroupLabel>
          {model.allSteps.length > model.nextSteps.length ? (
            <SectionLink
              label={`All ${model.allSteps.length} actions`}
              onClick={() => onNavigate('actions')}
            />
          ) : null}
        </div>
        <NextSteps steps={model.nextSteps.slice(0, 2)} />
      </section>

      <div className='grid gap-3 lg:grid-cols-2'>
        <section>
          <GroupLabel>Why you are here</GroupLabel>
          <Panel>
            <ul className='space-y-2'>
              {model.reasons.map((reason, i) => (
                <li key={i} className='flex items-center gap-2.5'>
                  {reason.positive ? (
                    <IconCircleCheck className='size-4 shrink-0 text-emerald-500' />
                  ) : (
                    <IconCircleDashed className='text-muted-foreground/50 size-4 shrink-0' />
                  )}
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[13px]',
                      reason.positive
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {reason.label}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </section>

        <section>
          <div className='mb-2.5 flex items-end justify-between gap-4'>
            <GroupLabel className='mb-0'>Progress by area</GroupLabel>
            <SectionLink
              label='See milestones'
              onClick={() => onNavigate('milestones')}
            />
          </div>
          <Panel className='space-y-3.5'>
            {model.pillars.map((pillar) => {
              const Icon = pillar.Icon;
              return (
                <div key={pillar.id}>
                  <div className='mb-1.5 flex items-center gap-2'>
                    <Icon className={cn('size-3.5 shrink-0', pillar.accent)} />
                    <span className='min-w-0 flex-1 truncate text-[12px] font-medium'>
                      {pillar.name}
                    </span>
                    <span className='text-muted-foreground shrink-0 text-[11px] tabular-nums'>
                      {pillar.completed}/{pillar.total}
                    </span>
                  </div>
                  <Meter value={pillar.score} tone={pillar.solid} />
                </div>
              );
            })}
          </Panel>
        </section>
      </div>
    </div>
  );
}

function SectionLink({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='text-muted-foreground hover:text-foreground group inline-flex shrink-0 items-center gap-1 text-[11px] font-medium transition-colors'
    >
      {label}
      <IconArrowRight className='size-3 transition-transform group-hover:translate-x-0.5' />
    </button>
  );
}
