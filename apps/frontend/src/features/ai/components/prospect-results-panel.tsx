'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@ringee/frontend-shared/components/ui/collapsible';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconChevronDown,
  IconClock,
  IconHistory,
  IconLock,
  IconSparkles,
  IconUserPlus
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { ProspectResultGroup } from '../hooks/use-ai-conversation';
import { ProspectCard } from './prospect-card';

interface Props {
  groups: ProspectResultGroup[];
  onRequestReveal: (jobId: string, externalIds: string[], revealPhone: boolean) => void;
  onRequestSave: (jobId: string, externalIds: string[]) => void;
}

interface GroupContext {
  selected: Set<string>;
  onToggle: (externalId: string) => void;
  onRequestReveal: Props['onRequestReveal'];
  onRequestSave: Props['onRequestSave'];
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

  // Groups come in chronological order (oldest first). The most recent is the
  // last element — surface it as the headline result.
  const latest = groups[groups.length - 1];
  const previous = groups.slice(0, -1).reverse();

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

  function ctxFor(jobId: string): GroupContext {
    return {
      selected: selected[jobId] ?? new Set(),
      onToggle: (externalId) => toggle(jobId, externalId),
      onRequestReveal,
      onRequestSave
    };
  }

  return (
    <div className='flex flex-col gap-3'>
      {previous.length > 0 && (
        <PreviousSearches groups={previous} ctxFor={ctxFor} />
      )}

      <GroupSection
        key={latest.toolEventId}
        group={latest}
        ctx={ctxFor(latest.jobId)}
        variant='latest'
      />

      {totalSelected > 0 && (
        <div className='sticky bottom-2 mt-1 self-center rounded-full bg-muted/80 px-3 py-1 text-[11px] text-muted-foreground'>
          {totalSelected} prospect{totalSelected === 1 ? '' : 's'} selected
        </div>
      )}
    </div>
  );
}

function PreviousSearches({
  groups,
  ctxFor
}: {
  groups: ProspectResultGroup[];
  ctxFor: (jobId: string) => GroupContext;
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
        <IconHistory size={12} />
        Previous searches
        <span className='rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground'>
          {groups.length}
        </span>
      </div>
      <div className='flex flex-col gap-1.5'>
        {groups.map((group) => (
          <CollapsibleGroup
            key={group.toolEventId}
            group={group}
            ctx={ctxFor(group.jobId)}
          />
        ))}
      </div>
    </div>
  );
}

function CollapsibleGroup({
  group,
  ctx
}: {
  group: ProspectResultGroup;
  ctx: GroupContext;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          'group flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/40',
          open && 'rounded-b-none border-b-transparent bg-muted/40'
        )}
      >
        <IconChevronDown
          size={14}
          className='shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180'
        />
        <div className='flex flex-1 items-center gap-2 min-w-0'>
          <span className='truncate text-sm font-medium'>
            {group.results.length} prospects via{' '}
            <span className='capitalize'>{group.provider}</span>
          </span>
          {ctx.selected.size > 0 && (
            <Badge variant='secondary' className='ml-auto text-[10px]'>
              {ctx.selected.size} selected
            </Badge>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='rounded-b-lg border border-t-0 border-border/60 bg-muted/10 p-3'>
          <GroupBody group={group} ctx={ctx} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function GroupSection({
  group,
  ctx,
  variant
}: {
  group: ProspectResultGroup;
  ctx: GroupContext;
  variant: 'latest';
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-xl p-3',
        ''
      )}
    >
      <header className='flex flex-col gap-2'>
        <div className='flex items-center gap-2'>
          <Badge
            variant='default'
            className='gap-1 bg-primary/15 text-primary hover:bg-primary/15'
          >
            <IconSparkles size={11} />
            Latest result
          </Badge>
          <span className='inline-flex items-center gap-1 text-[10px] text-muted-foreground'>
            <IconClock size={11} />
            just now
          </span>
        </div>
        <div>
          <div className='text-sm font-semibold'>
            {group.results.length} prospects via{' '}
            <span className='capitalize'>{group.provider}</span>
          </div>
          {group.filtersSummary && (
            <div className='mt-0.5 line-clamp-3 text-[11px] text-muted-foreground'>
              {group.filtersSummary}
            </div>
          )}
        </div>
        <GroupActions group={group} ctx={ctx} />
      </header>
      <GroupBody group={group} ctx={ctx} />
    </section>
  );
}

function GroupActions({
  group,
  ctx
}: {
  group: ProspectResultGroup;
  ctx: GroupContext;
}) {
  const selCount = ctx.selected.size;
  if (selCount === 0) return null;
  const sel = Array.from(ctx.selected);
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Button
        size='sm'
        variant='outline'
        className='h-7 gap-1 text-xs'
        onClick={() => ctx.onRequestReveal(group.jobId, sel, false)}
      >
        <IconLock size={13} /> Reveal email ({selCount})
      </Button>
      <Button
        size='sm'
        variant='outline'
        className='h-7 gap-1 text-xs'
        onClick={() => ctx.onRequestReveal(group.jobId, sel, true)}
      >
        <IconLock size={13} /> Reveal +phone
      </Button>
      <Button
        size='sm'
        className='h-7 gap-1 text-xs'
        onClick={() => ctx.onRequestSave(group.jobId, sel)}
      >
        <IconUserPlus size={13} /> Save ({selCount})
      </Button>
    </div>
  );
}

function GroupBody({
  group,
  ctx
}: {
  group: ProspectResultGroup;
  ctx: GroupContext;
}) {
  return (
    <>
      <div className='grid gap-2 md:grid-cols-2'>
        {group.results.slice(0, 12).map((p) => (
          <ProspectCard
            key={p.externalId}
            prospect={p}
            selected={ctx.selected.has(p.externalId)}
            onToggle={ctx.onToggle}
          />
        ))}
      </div>
      {group.results.length > 12 && (
        <div className='text-center text-xs text-muted-foreground'>
          Showing top 12 of {group.results.length} results.
        </div>
      )}
    </>
  );
}
