import Link from 'next/link';
import {
  IconArrowRight,
  IconCircleCheck,
  IconCircleDashed,
  IconSparkles
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Panel, ScoreRing } from './primitives';
import type { JourneyModel } from '../lib/journey';
import type { JourneySection } from './journey-sections';

/**
 * The answer to "where am I?" — the current stage, the readiness score behind it,
 * and the single sentence that says what unlocking the next stage is about.
 * It stays pinned above the section split, because the stage is the one thing
 * every section is read against.
 */
export function StageHero({
  model,
  onNavigate
}: {
  model: JourneyModel;
  onNavigate?: (section: JourneySection) => void;
}) {
  const { stage, nextStage, notStartedYet } = model;
  const Icon = stage.Icon;

  return (
    <Panel className={cn('relative overflow-hidden', stage.border)}>
      {/* A soft wash of the stage colour so each stage reads distinctly. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-28 -right-20 size-72 rounded-full opacity-15 blur-3xl',
          stage.solid
        )}
      />

      <div className='relative flex flex-col gap-6 lg:flex-row lg:items-center'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-start gap-4'>
            <span
              className={cn(
                'flex size-14 shrink-0 items-center justify-center rounded-2xl ring-1 ring-black/5 dark:ring-white/10',
                stage.tint,
                stage.accent
              )}
            >
              <Icon className='size-7' />
            </span>
            <div className='min-w-0'>
              <p className='text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase'>
                {notStartedYet ? 'Getting started' : 'Where you are'}
              </p>
              <h2 className='mt-0.5 text-2xl font-semibold tracking-tight'>
                {notStartedYet ? 'Let’s make your first call' : stage.name}
              </h2>
              <p className='text-muted-foreground mt-2 max-w-2xl text-[13px] leading-relaxed'>
                {notStartedYet
                  ? 'Connect a number, bring in some contacts and make a first call. Your journey takes shape from there — and this page will tell you exactly what to do next.'
                  : stage.summary}
              </p>
            </div>
          </div>

          {!notStartedYet && nextStage ? (
            <div className='bg-muted/40 mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3.5 py-2.5'>
              <IconSparkles
                className={cn('size-4 shrink-0', nextStage.accent)}
              />
              <span className='text-muted-foreground text-xs'>Next up</span>
              <span className='text-sm font-medium'>{nextStage.name}</span>
              <span className='text-muted-foreground text-xs'>
                — {stage.ambition}
              </span>
            </div>
          ) : null}

          {model.nextSteps.length > 0 ? (
            <div className='mt-5 flex flex-wrap items-center gap-2'>
              <Link
                href={model.nextSteps[0].action.href}
                className='bg-foreground text-background hover:bg-foreground/90 group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors'
                title={model.nextSteps[0].description}
              >
                {model.nextSteps[0].action.label}
                <IconArrowRight className='size-4 transition-transform group-hover:translate-x-0.5' />
              </Link>
              {onNavigate && model.allSteps.length > 1 ? (
                <button
                  type='button'
                  onClick={() => onNavigate('actions')}
                  className='text-muted-foreground hover:border-foreground/20 hover:text-foreground rounded-full border px-3.5 py-2 text-xs font-medium transition-colors'
                >
                  See all {model.allSteps.length} actions
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className='flex items-center gap-6 lg:flex-col lg:items-end lg:gap-4'>
          <ScoreRing
            value={model.score}
            label='Ready'
            tone={stage.accent}
            size={132}
          />
          <div className='min-w-0 lg:text-right'>
            <p className='text-muted-foreground text-xs'>
              {model.pillars.reduce((sum, p) => sum + p.completed, 0)} of{' '}
              {model.pillars.reduce((sum, p) => sum + p.total, 0)} milestones
            </p>
            <p className='mt-1 flex items-center gap-1.5 text-xs lg:justify-end'>
              {model.missing.length === 0 ? (
                <>
                  <IconCircleCheck className='size-3.5 shrink-0 text-emerald-500' />
                  <span className='text-muted-foreground'>Nothing pending</span>
                </>
              ) : (
                <>
                  <IconCircleDashed className='text-muted-foreground size-3.5 shrink-0' />
                  <span className='text-muted-foreground'>
                    {model.missing.length} still open
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
