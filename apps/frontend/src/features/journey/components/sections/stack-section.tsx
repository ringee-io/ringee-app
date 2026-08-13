import { IconPlugConnected } from '@tabler/icons-react';
import { GroupLabel, Meter, Panel } from '../primitives';
import { IntegrationsPanel } from '../integrations-panel';
import type { JourneyModel } from '../../lib/journey';

/**
 * Connected stack — how well Ringee is wired into everything around it. The
 * summary counts *live* connections; each card then shows what that integration
 * has actually done in the window, because a connected-but-idle integration is
 * not the same as a working one.
 */
export function StackSection({
  model,
  canAccessAdminFeatures
}: {
  model: JourneyModel;
  canAccessAdminFeatures: boolean;
}) {
  const connected = model.integrations.filter((i) => i.connected).length;
  const total = model.integrations.length;
  const score = Math.round((connected / total) * 100);

  return (
    <div className='space-y-7'>
      <Panel className='flex flex-col gap-4 sm:flex-row sm:items-center'>
        <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'>
          <IconPlugConnected className='size-5' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-semibold tracking-tight'>
            {connected} of {total} connected
          </p>
          <p className='text-muted-foreground mt-0.5 text-xs leading-relaxed'>
            {connected === 0
              ? 'Ringee works on its own, but it gets much stronger wired into your CRM, your calendar and a lead source.'
              : 'Each connection removes a place where work is retyped, forgotten or lost between tools.'}
          </p>
        </div>
        <div className='w-full shrink-0 sm:w-48'>
          <div className='mb-1.5 flex items-baseline justify-between'>
            <span className='text-muted-foreground text-[11px]'>
              Stack coverage
            </span>
            <span className='text-sm font-semibold tabular-nums'>{score}%</span>
          </div>
          <Meter value={score} tone='bg-cyan-500' />
        </div>
      </Panel>

      <section>
        <GroupLabel>Integrations</GroupLabel>
        <IntegrationsPanel
          integrations={model.integrations}
          canAccessAdminFeatures={canAccessAdminFeatures}
        />
      </section>
    </div>
  );
}
