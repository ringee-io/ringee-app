'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from 'next-intl';
import { GripVertical, Plus, Settings2, X } from 'lucide-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useEnumLabels } from '@/features/call-detail/lib/labels';
import { useSettingsDialogStore } from '@/features/settings/store/settings-dialog.store';
import type { Disposition, WorkspaceDisposition } from '../types';
import { DispositionSwatch } from './disposition-swatch';

interface Props {
  /** Picked workspace disposition ids, in the order the dialer shows them. */
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

/**
 * Picks which workspace dispositions a campaign's dialer shows, and in what
 * order (DISP-004). Nothing picked means the workspace's default set, which is
 * shown so the admin sees what agents will get either way.
 */
export function DispositionPicker({ value, onChange, disabled }: Props) {
  const t = useTranslations('campaigns.dispositions.picker');
  const api = useApi();
  const labels = useEnumLabels();
  const openSettings = useSettingsDialogStore((s) => s.openSettings);
  const [workspace, setWorkspace] = useState<WorkspaceDisposition[] | null>(
    null
  );
  const [defaults, setDefaults] = useState<Disposition[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<WorkspaceDisposition[]>('/dispositions'),
      api.get<Disposition[]>('/dispositions/defaults')
    ])
      .then(([rows, defaultSet]) => {
        if (cancelled) return;
        setWorkspace(rows);
        setDefaults(defaultSet);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const byId = useMemo(
    () => new Map((workspace ?? []).map((d) => [d.id, d])),
    [workspace]
  );
  const picked = value.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  // Only an active disposition can be picked; the server checks it as well.
  const available = (workspace ?? []).filter(
    (d) => d.isActive && !value.includes(d.id)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = value.indexOf(String(active.id));
    const to = value.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(value, from, to));
  };

  if (failed) {
    return <p className='text-destructive text-sm'>{t('loadError')}</p>;
  }
  if (!workspace) {
    return <Skeleton className='h-24 w-full rounded-lg' />;
  }

  const outcomeOf = (d: Disposition) =>
    d.canonicalOutcome ? (labels.outcome(d.canonicalOutcome) ?? '') : '';

  return (
    <div className='space-y-3'>
      {picked.length === 0 ? (
        <div className='rounded-lg border border-dashed p-3'>
          <p className='text-muted-foreground text-xs'>{t('usesDefaults')}</p>
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {defaults.map((d) => (
              <span
                key={d.id}
                className='bg-muted inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs'
              >
                <DispositionSwatch color={d.color} className='size-2.5' />
                {d.label}
              </span>
            ))}
          </div>
          {defaults.length > 0 ? (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='mt-1 h-auto px-0 text-xs'
              disabled={disabled}
              onClick={() => onChange(defaults.map((d) => d.id))}
            >
              {t('customizeFromDefaults')}
            </Button>
          ) : null}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={value} strategy={verticalListSortingStrategy}>
            <ol className='space-y-1.5'>
              {picked.map((d, index) => (
                <PickedRow
                  key={d.id}
                  disposition={d}
                  position={index + 1}
                  outcome={outcomeOf(d)}
                  disabled={disabled}
                  onRemove={() => onChange(value.filter((id) => id !== d.id))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <div className='flex flex-wrap items-center gap-2'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={disabled || available.length === 0}
            >
              <Plus className='size-4' />
              {t('add')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='start'
            className='max-h-72 w-64 overflow-y-auto'
          >
            <DropdownMenuLabel className='text-muted-foreground text-xs font-normal'>
              {t('addHint')}
            </DropdownMenuLabel>
            {available.map((d) => (
              <DropdownMenuItem
                key={d.id}
                onClick={() => onChange([...value, d.id])}
                className='flex items-center gap-2'
              >
                <DispositionSwatch color={d.color} />
                <span className='min-w-0 flex-1 truncate'>{d.label}</span>
                <span className='text-muted-foreground shrink-0 text-[11px]'>
                  {outcomeOf(d)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {picked.length > 0 ? (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            disabled={disabled}
            onClick={() => onChange([])}
          >
            {t('useDefaults')}
          </Button>
        ) : null}
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='text-muted-foreground ml-auto'
          onClick={() => openSettings('dispositions')}
        >
          <Settings2 className='size-4' />
          {t('manage')}
        </Button>
      </div>
    </div>
  );
}

function PickedRow({
  disposition,
  position,
  outcome,
  disabled,
  onRemove
}: {
  disposition: Disposition;
  position: number;
  outcome: string;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const t = useTranslations('campaigns.dispositions.picker');
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging
  } = useSortable({ id: disposition.id, disabled });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'bg-card flex items-center gap-2 rounded-md border px-2 py-1.5',
        isDragging && 'ring-primary relative z-10 shadow-md ring-2'
      )}
    >
      <button
        type='button'
        className='text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-6 cursor-grab items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing'
        aria-label={t('dragToReorder')}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className='size-3.5' />
      </button>
      <span className='text-muted-foreground w-4 text-right font-mono text-[11px]'>
        {position}
      </span>
      <DispositionSwatch color={disposition.color} />
      <span className='min-w-0 flex-1 truncate text-sm'>
        {disposition.label}
      </span>
      <span className='text-muted-foreground hidden shrink-0 text-xs sm:inline'>
        {outcome}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-7'
        disabled={disabled}
        aria-label={t('remove', { name: disposition.label })}
        onClick={onRemove}
      >
        <X className='size-3.5' />
      </Button>
    </li>
  );
}
