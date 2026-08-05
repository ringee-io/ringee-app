'use client';

import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useJourneyCopy } from '../lib/copy';
import type { JourneyCapability } from '../types';

/**
 * Advanced capabilities, and the "what counts" explanation.
 *
 * Both live together on purpose: the fastest way to make a progress system feel
 * arbitrary is to show a checklist without saying what makes an item tick. The
 * rule is one sentence — a capability counts once it has produced real results,
 * not when it is switched on — and it is the same rule the backend enforces.
 */
export function CapabilitiesPanel({
  capabilities,
  workspaceType,
  window
}: {
  capabilities: JourneyCapability[];
  workspaceType: 'personal' | 'organization';
  window: { days: number; timeZone: string };
}) {
  const { t, dynamic } = useJourneyCopy();
  const used = capabilities.filter((c) => c.used);
  const unused = capabilities.filter((c) => !c.used);

  return (
    <section className='grid gap-4 lg:grid-cols-2'>
      <div className='bg-card rounded-2xl border p-5'>
        <h2 className='text-sm font-semibold'>{t('capabilities.heading')}</h2>
        <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
          {t('capabilities.hint')}
        </p>

        <ul className='mt-4 flex flex-wrap gap-1.5'>
          {[...used, ...unused].map((capability) => (
            <li key={capability.id}>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
                  capability.used
                    ? 'bg-emerald-600/15 font-medium text-emerald-800 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {capability.used && (
                  <IconCheck className='size-3' stroke={3} aria-hidden='true' />
                )}
                <span className='sr-only'>
                  {capability.used
                    ? `${t('capabilities.used')}: `
                    : `${t('capabilities.unused')}: `}
                </span>
                {dynamic(`capabilities.${capability.id}`, capability.id)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className='bg-card rounded-2xl border p-5'>
        <h2 className='flex items-center gap-1.5 text-sm font-semibold'>
          <IconInfoCircle
            className='text-muted-foreground size-4'
            aria-hidden='true'
          />
          {t('counts.heading')}
        </h2>
        <p className='text-muted-foreground mt-2 text-xs leading-relaxed'>
          {t('counts.body')}
        </p>
        <p className='text-muted-foreground mt-2 text-xs leading-relaxed'>
          {t('counts.doesNotCount')}
        </p>
        {workspaceType === 'organization' && (
          <p className='text-muted-foreground mt-2 text-xs leading-relaxed'>
            {t('counts.workspaceScope')}
          </p>
        )}
        <p className='text-muted-foreground/80 mt-3 text-[11px]'>
          {t('window.label', {
            days: window.days,
            timeZone: window.timeZone
          })}
        </p>
      </div>
    </section>
  );
}
