import Link from 'next/link';
import {
  IconArrowRight,
  IconPlugOff,
  IconPlugConnected
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Panel } from './primitives';
import type { JourneyIntegrationCard } from '../lib/journey';

/**
 * The connected stack: CRM, your own systems, calendar, lead sourcing and AI
 * agents. Each card states whether it is live and — more usefully — what it has
 * actually done in the window, so "connected" never means "connected and idle".
 *
 * Connected state is carried by an icon *and* a word, never by colour alone.
 */
export function IntegrationsPanel({
  integrations,
  canAccessAdminFeatures
}: {
  integrations: JourneyIntegrationCard[];
  canAccessAdminFeatures: boolean;
}) {
  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
      {integrations.map((item) => {
        const Icon = item.Icon;
        const canAct = canAccessAdminFeatures || !item.action.adminOnly;

        return (
          <Panel key={item.id} className='flex flex-col gap-3'>
            <div className='flex items-start gap-3'>
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl',
                  item.tint,
                  item.accent
                )}
              >
                <Icon className='size-5' />
              </span>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2'>
                  <p className='truncate text-sm font-semibold tracking-tight'>
                    {item.name}
                  </p>
                  <StatusChip connected={item.connected} />
                </div>
                <p className='text-muted-foreground mt-0.5 text-[12px] leading-relaxed'>
                  {item.description}
                </p>
              </div>
            </div>

            {item.connected ? (
              <div className='space-y-2'>
                {item.providers.length > 0 ? (
                  <div className='flex flex-wrap gap-1'>
                    {item.providers.map((provider) => (
                      <span
                        key={provider}
                        className='bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px] font-medium'
                      >
                        {provider}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className='flex flex-wrap gap-x-4 gap-y-1'>
                  {item.stats.map((stat) => (
                    <p key={stat.label} className='text-[11px]'>
                      <span className='font-semibold tabular-nums'>
                        {stat.value}
                      </span>{' '}
                      <span className='text-muted-foreground'>
                        {stat.label}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {canAct ? (
              <Link
                href={item.action.href}
                className='text-muted-foreground hover:border-foreground/20 hover:text-foreground group mt-auto inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-medium transition-colors'
              >
                {item.action.label}
                <IconArrowRight className='size-3.5 transition-transform group-hover:translate-x-0.5' />
              </Link>
            ) : (
              <p className='text-muted-foreground/70 mt-auto text-[11px]'>
                Ask a workspace admin to set this up.
              </p>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

function StatusChip({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        connected
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {connected ? (
        <IconPlugConnected className='size-3' />
      ) : (
        <IconPlugOff className='size-3' />
      )}
      {connected ? 'Connected' : 'Not connected'}
    </span>
  );
}
