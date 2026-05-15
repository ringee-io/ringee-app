'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { IconUserPlus, IconLock } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { ProspectResultGroup } from '../hooks/use-ai-conversation';
import { ProspectCard } from './prospect-card';

interface Props {
  groups: ProspectResultGroup[];
  onRequestReveal: (jobId: string, externalIds: string[], revealPhone: boolean) => void;
  onRequestSave: (jobId: string, externalIds: string[]) => void;
}

export function ProspectResultsPanel({
  groups,
  onRequestReveal,
  onRequestSave
}: Props) {
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const totalSelected = useMemo(
    () =>
      Object.values(selected).reduce((sum, s) => sum + s.size, 0),
    [selected]
  );

  if (groups.length === 0) return null;

  function toggle(jobId: string, externalId: string) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[jobId] ?? []);
      if (set.has(externalId)) set.delete(externalId);
      else set.add(externalId);
      next[jobId] = set;
      return next;
    });
  }

  function selectedForJob(jobId: string): string[] {
    return Array.from(selected[jobId] ?? []);
  }

  return (
    <div className='flex flex-col gap-3'>
      {groups.map((group) => {
        const sel = selectedForJob(group.jobId);
        return (
          <section
            key={group.toolEventId}
            className='flex flex-col gap-2 rounded-lg bg-background/60 p-3'
          >
            <header className='flex items-center justify-between gap-2'>
              <div>
                <div className='text-sm font-semibold'>
                  {group.results.length} prospects via{' '}
                  <span className='capitalize'>{group.provider}</span>
                </div>
                {group.filtersSummary && (
                  <div className='text-[11px] text-muted-foreground'>
                    {group.filtersSummary}
                  </div>
                )}
              </div>
              {sel.length > 0 && (
                <div className='flex items-center gap-1.5'>
                  <Button
                    size='sm'
                    variant='outline'
                    className='h-7 gap-1 text-xs'
                    onClick={() => onRequestReveal(group.jobId, sel, false)}
                  >
                    <IconLock size={13} /> Reveal email ({sel.length})
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    className='h-7 gap-1 text-xs'
                    onClick={() => onRequestReveal(group.jobId, sel, true)}
                  >
                    <IconLock size={13} /> Reveal +phone
                  </Button>
                  <Button
                    size='sm'
                    className='h-7 gap-1 text-xs'
                    onClick={() => onRequestSave(group.jobId, sel)}
                  >
                    <IconUserPlus size={13} /> Save ({sel.length})
                  </Button>
                </div>
              )}
            </header>

            <div className='grid gap-2 md:grid-cols-2'>
              {group.results.slice(0, 12).map((p) => (
                <ProspectCard
                  key={p.externalId}
                  prospect={p}
                  selected={(selected[group.jobId] ?? new Set()).has(p.externalId)}
                  onToggle={(eid) => toggle(group.jobId, eid)}
                />
              ))}
            </div>
            {group.results.length > 12 && (
              <div className='text-center text-xs text-muted-foreground'>
                Showing top 12 of {group.results.length} results.
              </div>
            )}
          </section>
        );
      })}

      {totalSelected > 0 && (
        <div className='sticky bottom-2 mt-1 self-center rounded-full bg-muted/80 px-3 py-1 text-[11px] text-muted-foreground'>
          {totalSelected} prospect{totalSelected === 1 ? '' : 's'} selected
        </div>
      )}
    </div>
  );
}
