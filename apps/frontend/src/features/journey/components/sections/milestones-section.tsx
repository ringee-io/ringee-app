import { IconCircleCheck } from '@tabler/icons-react';
import { GroupLabel, Meter, Panel } from '../primitives';
import { PillarsPanel } from '../pillars-panel';
import type { JourneyModel } from '../../lib/journey';

/**
 * Milestones — the full audit trail behind the stage and the score. Nothing here
 * is a judgement: every row is a fact about the workspace with the live number
 * next to it, so a user can always trace *why* they are where they are.
 */
export function MilestonesSection({
  model,
  canAccessAdminFeatures
}: {
  model: JourneyModel;
  canAccessAdminFeatures: boolean;
}) {
  const completed = model.pillars.reduce((sum, p) => sum + p.completed, 0);
  const total = model.pillars.reduce((sum, p) => sum + p.total, 0);

  return (
    <div className='space-y-7'>
      <Panel className='flex flex-col gap-4 sm:flex-row sm:items-center'>
        <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
          <IconCircleCheck className='size-5' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-semibold tracking-tight'>
            {completed} of {total} milestones met
          </p>
          <p className='text-muted-foreground mt-0.5 text-xs'>
            Measured over the last {model.windowDays} days.
            {model.hasOrg
              ? ' Campaign milestones apply because this is an organization workspace.'
              : ' Campaign milestones are excluded — campaigns need an organization.'}
          </p>
        </div>
        <div className='w-full shrink-0 sm:w-48'>
          <div className='mb-1.5 flex items-baseline justify-between'>
            <span className='text-muted-foreground text-[11px]'>Overall</span>
            <span className='text-sm font-semibold tabular-nums'>
              {model.score}%
            </span>
          </div>
          <Meter value={model.score} tone={model.stage.solid} />
        </div>
      </Panel>

      <section>
        <GroupLabel>By area</GroupLabel>
        <PillarsPanel
          pillars={model.pillars}
          canAccessAdminFeatures={canAccessAdminFeatures}
        />
      </section>
    </div>
  );
}
