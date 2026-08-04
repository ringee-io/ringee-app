'use client';

import { useCallback, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { IconBuilding, IconInfoCircle, IconUser } from '@tabler/icons-react';
import { contentVariants } from '../lib/motion';
import { buildJourney } from '../lib/journey';
import type { JourneyOverview } from '../types';
import { StageHero } from './stage-hero';
import { StagePath } from './stage-path';
import { JourneySidebar, JourneySectionTabs } from './journey-sidebar';
import {
  DEFAULT_JOURNEY_SECTION,
  JOURNEY_SECTIONS,
  type JourneySection
} from './journey-sections';
import { OverviewSection } from './sections/overview-section';
import { ActionsSection } from './sections/actions-section';
import { RewardsSection } from './sections/rewards-section';
import { MilestonesSection } from './sections/milestones-section';
import { ActivitySection } from './sections/activity-section';
import { StackSection } from './sections/stack-section';

const SECTION_IDS = JOURNEY_SECTIONS.map((s) => s.id) as [
  JourneySection,
  ...JourneySection[]
];

/**
 * Journey — the first thing a user sees after signing in.
 *
 * The stage header (where you are, and the path you are on) is the constant and
 * stays pinned at the top; everything else is split into focused sections behind
 * a secondary sidebar, so the page answers one question at a time instead of
 * being a wall. The active section lives in the URL, so a link like
 * `?section=actions` shares the exact view.
 *
 * All five sections read from one payload built once — switching is instant and
 * costs no request.
 */
export function JourneyWorkspace({
  data,
  canAccessAdminFeatures
}: {
  data: JourneyOverview;
  canAccessAdminFeatures: boolean;
}) {
  const reduce = useReducedMotion();
  const model = useMemo(
    () => buildJourney({ data, canAccessAdminFeatures }),
    [data, canAccessAdminFeatures]
  );

  const [section, setSection] = useQueryState(
    'section',
    parseAsStringLiteral(SECTION_IDS).withDefault(DEFAULT_JOURNEY_SECTION)
  );

  const select = useCallback(
    (next: JourneySection) => {
      void setSection(next);
    },
    [setSection]
  );

  const claimableRewards = model.rewards.items.filter(
    (r) => r.status === 'claimable'
  ).length;

  const counts = useMemo(
    () => ({
      actions: model.allSteps.length,
      rewards: claimableRewards
    }),
    [model.allSteps.length, claimableRewards]
  );

  return (
    <div className='w-full min-w-0 space-y-5 pb-2'>
      {/* ── The constant: who this workspace is, where it stands, its path ── */}
      <ScopeBar model={model} />
      <StageHero
        model={model}
        onNavigate={select}
        canAccessAdminFeatures={canAccessAdminFeatures}
      />
      <StagePath model={model} onNavigate={select} />

      {/* ── The split: secondary nav + one focused section ────────────────── */}
      <div className='flex min-w-0 flex-col gap-5 md:flex-row'>
        <JourneySidebar active={section} onSelect={select} counts={counts} />

        <div className='min-w-0 flex-1'>
          <div className='bg-background/80 sticky top-0 z-10 -mx-1 mb-3 px-1 py-2 backdrop-blur-xl md:hidden'>
            <JourneySectionTabs
              active={section}
              onSelect={select}
              counts={counts}
            />
          </div>

          <AnimatePresence mode='wait'>
            <motion.div
              key={section}
              variants={reduce ? undefined : contentVariants}
              initial={reduce ? false : 'hidden'}
              animate='visible'
              exit={reduce ? undefined : 'exit'}
            >
              {section === 'overview' ? (
                <OverviewSection model={model} onNavigate={select} />
              ) : section === 'actions' ? (
                <ActionsSection model={model} />
              ) : section === 'rewards' ? (
                <RewardsSection
                  model={model}
                  canAccessAdminFeatures={canAccessAdminFeatures}
                />
              ) : section === 'milestones' ? (
                <MilestonesSection
                  model={model}
                  canAccessAdminFeatures={canAccessAdminFeatures}
                />
              ) : section === 'activity' ? (
                <ActivitySection model={model} />
              ) : (
                <StackSection
                  model={model}
                  canAccessAdminFeatures={canAccessAdminFeatures}
                />
              )}
            </motion.div>
          </AnimatePresence>

          <p className='text-muted-foreground/70 mt-8 flex items-start gap-1.5 text-[11px]'>
            <IconInfoCircle className='mt-px size-3.5 shrink-0' />
            <span>
              Your stage comes from your own workspace over the last{' '}
              {model.windowDays} days — no benchmarks, no guesswork.
              {model.scopedToMember
                ? ' You are seeing your own calling activity.'
                : ''}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Which workspace this journey describes. It matters: an organization and a
 * personal workspace are measured on genuinely different paths.
 */
function ScopeBar({ model }: { model: ReturnType<typeof buildJourney> }) {
  const Icon = model.hasOrg ? IconBuilding : IconUser;

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <span className='bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium'>
        <Icon className='size-3.5' />
        {model.hasOrg ? 'Organization workspace' : 'Personal workspace'}
      </span>
      {!model.hasOrg ? (
        <span className='text-muted-foreground/70 text-[11px]'>
          Campaigns are an organization feature, so they are not part of your
          path.
        </span>
      ) : null}
    </div>
  );
}
