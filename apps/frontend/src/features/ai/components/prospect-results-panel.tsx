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
  IconChevronUp,
  IconClock,
  IconHistory,
  IconLock,
  IconSparkles,
  IconUserPlus
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { ProspectResultGroup } from '../hooks/use-ai-conversation';
import { ProspectCard } from './prospect-card';

/** Title-case a provider slug (e.g. `apollo` → `Apollo`) for display. */
function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

interface Props {
  groups: ProspectResultGroup[];
  onRequestReveal: (
    jobId: string,
    externalIds: string[],
    revealPhone: boolean
  ) => void;
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
  const t = useTranslations('ai.results');
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const totalSelected = useMemo(
    () => Object.values(selected).reduce((sum, s) => sum + s.size, 0),
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
        <div className='bg-muted/80 text-muted-foreground sticky bottom-2 mt-1 self-center rounded-full px-3 py-1 text-[11px]'>
          {t('selectedCount', { count: totalSelected })}
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
  const t = useTranslations('ai.results');
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='text-muted-foreground flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wide uppercase'>
        <IconHistory size={12} />
        {t('previousSearches')}
        <span className='bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold'>
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
  const t = useTranslations('ai.results');
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          'group border-border/60 bg-muted/20 hover:bg-muted/40 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
          open && 'bg-muted/40 rounded-b-none border-b-transparent'
        )}
      >
        <IconChevronDown
          size={14}
          className='text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180'
        />
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          <span className='truncate text-sm font-medium'>
            {t('prospectsVia', {
              count: group.results.length,
              provider: capitalize(group.provider)
            })}
          </span>
          {ctx.selected.size > 0 && (
            <Badge variant='secondary' className='ml-auto text-[10px]'>
              {t('selected', { count: ctx.selected.size })}
            </Badge>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='border-border/60 bg-muted/10 rounded-b-lg border border-t-0 p-3'>
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
  const t = useTranslations('ai.results');
  return (
    <section className={cn('flex flex-col gap-3 rounded-xl p-3', '')}>
      <header className='flex flex-col gap-2'>
        <div className='flex items-center gap-2'>
          <Badge
            variant='default'
            className='bg-primary/15 text-primary hover:bg-primary/15 gap-1'
          >
            <IconSparkles size={11} />
            {t('latestResult')}
          </Badge>
          <span className='text-muted-foreground inline-flex items-center gap-1 text-[10px]'>
            <IconClock size={11} />
            {t('justNow')}
          </span>
        </div>
        <div>
          <div className='text-sm font-semibold'>
            {t('prospectsVia', {
              count: group.results.length,
              provider: capitalize(group.provider)
            })}
          </div>
          {group.filtersSummary && (
            <div className='text-muted-foreground mt-0.5 line-clamp-3 text-[11px]'>
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
  const t = useTranslations('ai.results');
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
        <IconLock size={13} /> {t('revealEmail', { count: selCount })}
      </Button>
      <Button
        size='sm'
        variant='outline'
        className='h-7 gap-1 text-xs'
        onClick={() => ctx.onRequestReveal(group.jobId, sel, true)}
      >
        <IconLock size={13} /> {t('revealPhone')}
      </Button>
      <Button
        size='sm'
        className='h-7 gap-1 text-xs'
        onClick={() => ctx.onRequestSave(group.jobId, sel)}
      >
        <IconUserPlus size={13} /> {t('save', { count: selCount })}
      </Button>
    </div>
  );
}

const INITIAL_VISIBLE = 12;

function GroupBody({
  group,
  ctx
}: {
  group: ProspectResultGroup;
  ctx: GroupContext;
}) {
  const t = useTranslations('ai.results');
  const [showAll, setShowAll] = useState(false);
  const hasMore = group.results.length > INITIAL_VISIBLE;
  const visible =
    showAll || !hasMore
      ? group.results
      : group.results.slice(0, INITIAL_VISIBLE);

  return (
    <>
      <div className='grid gap-2 md:grid-cols-2'>
        {visible.map((p) => (
          <ProspectCard
            key={p.externalId}
            prospect={p}
            selected={ctx.selected.has(p.externalId)}
            onToggle={ctx.onToggle}
          />
        ))}
      </div>
      {hasMore && (
        <Button
          variant='outline'
          size='sm'
          className='h-8 w-full gap-1 text-xs'
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? (
            <>
              <IconChevronUp size={14} /> {t('showLess')}
            </>
          ) : (
            <>
              <IconChevronDown size={14} />{' '}
              {t('showAll', { count: group.results.length })}
            </>
          )}
        </Button>
      )}
    </>
  );
}
