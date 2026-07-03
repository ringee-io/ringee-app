'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  IconRocket,
  IconCheck,
  IconCircleCheck,
  IconCircleDashed,
  IconArrowRight,
  IconChevronRight,
  IconPointFilled,
  IconSparkles,
  IconUsers
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { SPRING } from '../../../lib/motion';
import {
  JOURNEY_STAGE_ORDER,
  JOURNEY_STAGES,
  type JourneyAction,
  type JourneyState
} from '../../../lib/journey';
import { useInfraStore } from '../../../store/infra.store';
import type { UsageSection } from '../usage-sections';
import { GroupLabel, Panel, SectionIntro } from '../usage-primitives';

/**
 * Journey — the strategic, consultative view. Places the workspace on one of five
 * maturity stages ("Solo Caller" → "Call Center Infrastructure"), explains why,
 * what's missing, and what to build next. Every CTA hands off to the same places
 * a user would go anyway: the architecture canvas (focus / add resource), a sibling
 * Usage view, or a dashboard flow — so direction turns straight into action.
 */
export function UsageJourneySection({
  journey,
  onNavigate
}: {
  journey: JourneyState;
  onNavigate: (section: UsageSection) => void;
}) {
  const runAction = useJourneyAction(onNavigate);
  const { stage, notEnoughData } = journey;

  return (
    <div className='space-y-8'>
      <SectionIntro
        title='Your call center journey'
        description='See where your operation stands and what to build next.'
        icon={IconRocket}
      />

      {notEnoughData ? (
        <NotEnoughHero />
      ) : (
        <CurrentStageCard journey={journey} />
      )}

      <StagePath currentIndex={journey.stageIndex} hasOrg={journey.hasOrg} />

      {!notEnoughData ? (
        <div className='grid gap-4 lg:grid-cols-2'>
          <WhyThisStage journey={journey} />
          <WhatIsMissing journey={journey} onAction={runAction} />
        </div>
      ) : null}

      <div>
        <GroupLabel>Recommended next steps</GroupLabel>
        {journey.nextSteps.length === 0 ? (
          <Panel className='flex items-center gap-3'>
            <span className='flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400'>
              <IconCircleCheck className='size-5' />
            </span>
            <div>
              <p className='text-sm font-medium'>You&apos;re in great shape</p>
              <p className='text-muted-foreground text-xs'>
                Keep an eye on health and cost — there&apos;s nothing urgent to
                build right now.
              </p>
            </div>
          </Panel>
        ) : (
          <div className='grid gap-3 sm:grid-cols-2'>
            {journey.nextSteps.map((step) => (
              <NextStepCard
                key={step.id}
                step={step}
                onAction={() => runAction(step.action)}
              />
            ))}
          </div>
        )}
      </div>

      {!notEnoughData ? (
        <p className='text-muted-foreground/70 text-center text-[11px]'>
          {`${stage.message} Your stage is set from your live workspace — no guesswork.`}
        </p>
      ) : null}
    </div>
  );
}

// ── Action executor ──────────────────────────────────────────────────────────

function useJourneyAction(onNavigate: (section: UsageSection) => void) {
  const router = useRouter();
  const requestAdd = useInfraStore((s) => s.requestAdd);
  const setFocusNode = useInfraStore((s) => s.setFocusNode);

  return useCallback(
    (action: JourneyAction) => {
      switch (action.kind) {
        case 'section':
          onNavigate(action.section);
          break;
        case 'add':
          // The canvas consumes the pending add-request once it mounts.
          requestAdd(action.resource);
          router.push('/infra/overview');
          break;
        case 'focus':
          setFocusNode(action.nodeId, action.tab ?? null);
          router.push('/infra/overview');
          break;
        case 'route':
          router.push(action.href);
          break;
      }
    },
    [router, requestAdd, setFocusNode, onNavigate]
  );
}

// ── Current stage card ───────────────────────────────────────────────────────

function CurrentStageCard({ journey }: { journey: JourneyState }) {
  const { stage, stageIndex, totalStages } = journey;
  const Icon = stage.Icon;

  return (
    <Panel className='relative overflow-hidden'>
      {/* A soft wash of the stage colour, so each stage reads distinctly. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-24 -right-16 size-64 rounded-full opacity-20 blur-3xl',
          stage.solid
        )}
      />
      <div className='relative flex flex-col gap-5 sm:flex-row sm:items-start'>
        <span
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/10',
            stage.tint,
            stage.accent
          )}
        >
          <Icon className='size-7' />
        </span>

        <div className='min-w-0 flex-1'>
          <p className='text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase'>
            Current stage
          </p>
          <h2 className='mt-0.5 text-xl font-semibold tracking-tight'>
            {stage.name}
          </h2>
          <p className='text-muted-foreground mt-1.5 max-w-xl text-[13px] leading-relaxed'>
            {stage.summary}
          </p>
        </div>

        <div className='shrink-0 sm:w-40'>
          <div className='flex items-baseline gap-1.5'>
            <span className='text-2xl font-semibold tabular-nums'>
              {stageIndex + 1}
            </span>
            <span className='text-muted-foreground text-xs'>
              of {totalStages} stages
            </span>
          </div>
          <div className='mt-2 flex gap-1'>
            {JOURNEY_STAGE_ORDER.map((id, i) => (
              <span
                key={id}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i <= stageIndex ? stage.solid : 'bg-muted/70'
                )}
              />
            ))}
          </div>
          <p
            className={cn('mt-2 text-[11px] font-medium', stage.accent)}
            title={stage.message}
          >
            {stage.message}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function NotEnoughHero() {
  return (
    <Panel className='relative overflow-hidden'>
      <div
        aria-hidden
        className='pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-sky-500 opacity-15 blur-3xl'
      />
      <div className='relative flex flex-col gap-4 sm:flex-row sm:items-center'>
        <span className='flex size-14 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-400 ring-1 ring-white/10'>
          <IconSparkles className='size-7' />
        </span>
        <div className='min-w-0'>
          <p className='text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase'>
            Getting started
          </p>
          <h2 className='mt-0.5 text-xl font-semibold tracking-tight'>
            Not enough activity yet
          </h2>
          <p className='text-muted-foreground mt-1.5 max-w-xl text-[13px] leading-relaxed'>
            Connect a number and make your first calls, and your journey will
            take shape here — with a clear read on where you stand and what to
            build next.
          </p>
        </div>
      </div>
    </Panel>
  );
}

// ── Progress path ────────────────────────────────────────────────────────────

function StagePath({
  currentIndex,
  hasOrg
}: {
  currentIndex: number;
  hasOrg: boolean;
}) {
  const reduce = useReducedMotion();
  const last = JOURNEY_STAGE_ORDER.length - 1;

  return (
    <div>
      <GroupLabel>Your path</GroupLabel>
      <Panel>
        <div className='flex items-start'>
          {JOURNEY_STAGE_ORDER.map((id, i) => {
            const stage = JOURNEY_STAGES[id];
            const Icon = stage.Icon;
            const done = i < currentIndex;
            const current = i === currentIndex;
            const orgHint = stage.orgOnly && !hasOrg && !done && !current;

            return (
              <div
                key={id}
                className='relative flex min-w-0 flex-1 flex-col items-center'
              >
                {/* Connector — left half (segment into this node). */}
                {i > 0 ? (
                  <span
                    className={cn(
                      'absolute top-5 right-1/2 left-0 h-0.5',
                      i <= currentIndex ? stage.solid : 'bg-border'
                    )}
                  />
                ) : null}
                {/* Connector — right half (segment out of this node). */}
                {i < last ? (
                  <span
                    className={cn(
                      'absolute top-5 left-1/2 h-0.5',
                      i < currentIndex
                        ? JOURNEY_STAGES[JOURNEY_STAGE_ORDER[i + 1]].solid
                        : 'bg-border',
                      'right-0'
                    )}
                  />
                ) : null}

                <motion.span
                  initial={reduce ? false : { scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={
                    reduce ? { duration: 0 } : { ...SPRING, delay: i * 0.05 }
                  }
                  className={cn(
                    'relative z-10 flex size-10 items-center justify-center rounded-full ring-1 transition-colors',
                    done && cn(stage.solid, 'text-white ring-white/10'),
                    current &&
                      cn(
                        stage.tint,
                        stage.accent,
                        'shadow-lg ring-2',
                        stage.ring
                      ),
                    !done &&
                      !current &&
                      'bg-muted/60 text-muted-foreground/70 ring-border'
                  )}
                >
                  {done ? (
                    <IconCheck className='size-5' />
                  ) : (
                    <Icon className='size-5' />
                  )}
                </motion.span>

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
                  {current ? (
                    <p className={cn('truncate text-[10px]', stage.accent)}>
                      You are here
                    </p>
                  ) : orgHint ? (
                    <p className='text-muted-foreground/50 mt-0.5 hidden items-center justify-center gap-0.5 text-[10px] sm:flex'>
                      <IconUsers className='size-2.5' />
                      Team
                    </p>
                  ) : (
                    <p className='text-muted-foreground/40 hidden truncate text-[10px] sm:block'>
                      {stage.focus}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ── Why this stage ───────────────────────────────────────────────────────────

function WhyThisStage({ journey }: { journey: JourneyState }) {
  return (
    <Panel>
      <p className='mb-3 text-sm font-semibold tracking-tight'>
        Why this stage
      </p>
      <ul className='space-y-2'>
        {journey.reasons.map((reason, i) => (
          <li key={i} className='flex items-center gap-2.5'>
            {reason.positive ? (
              <IconCircleCheck className='size-4 shrink-0 text-emerald-400' />
            ) : (
              <IconCircleDashed className='text-muted-foreground/60 size-4 shrink-0' />
            )}
            <span
              className={cn(
                'text-[13px]',
                reason.positive ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {reason.label}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── What is missing ──────────────────────────────────────────────────────────

function WhatIsMissing({
  journey,
  onAction
}: {
  journey: JourneyState;
  onAction: (action: JourneyAction) => void;
}) {
  return (
    <Panel>
      <p className='mb-3 text-sm font-semibold tracking-tight'>
        What is missing
      </p>
      {journey.missing.length === 0 ? (
        <div className='flex items-center gap-2.5'>
          <IconCircleCheck className='size-4 shrink-0 text-emerald-400' />
          <span className='text-muted-foreground text-[13px]'>
            Nothing major is missing — you&apos;re in good shape.
          </span>
        </div>
      ) : (
        <ul className='space-y-1'>
          {journey.missing.map((item) => {
            const Row = item.action ? 'button' : 'div';
            return (
              <Row
                key={item.id}
                type={item.action ? 'button' : undefined}
                onClick={item.action ? () => onAction(item.action!) : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors',
                  item.action && 'hover:bg-accent/40'
                )}
              >
                <IconPointFilled className='text-muted-foreground/50 size-3.5 shrink-0' />
                <span className='text-foreground min-w-0 flex-1 truncate text-[13px]'>
                  {item.label}
                </span>
                {item.action ? (
                  <IconChevronRight className='text-muted-foreground/60 size-4 shrink-0' />
                ) : null}
              </Row>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ── Next step card ───────────────────────────────────────────────────────────

function NextStepCard({
  step,
  onAction
}: {
  step: JourneyState['nextSteps'][number];
  onAction: () => void;
}) {
  const Icon = step.Icon;
  return (
    <Panel className='flex flex-col gap-3'>
      <div className='flex items-start gap-3'>
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl',
            step.tile
          )}
        >
          <Icon className='size-5' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-semibold tracking-tight'>{step.title}</p>
          <p className='text-muted-foreground mt-0.5 text-[12px] leading-relaxed'>
            {step.description}
          </p>
        </div>
      </div>
      <button
        type='button'
        onClick={onAction}
        className='text-muted-foreground hover:border-foreground/20 hover:text-foreground group inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-medium transition-colors'
      >
        {step.ctaLabel}
        <IconArrowRight className='size-3.5 transition-transform group-hover:translate-x-0.5' />
      </button>
    </Panel>
  );
}
