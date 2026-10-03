'use client';

import { useState } from 'react';
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
import { toast } from 'sonner';
import { GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useEnumLabels } from '@/features/call-detail/lib/labels';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import { useWorkspaceDispositions } from '../hooks/use-workspace-dispositions';
import type { DispositionInput, WorkspaceDisposition } from '../types';
import { DispositionFormDialog } from './disposition-form-dialog';
import { DispositionSwatch } from './disposition-swatch';

/** Columns shared by the header and every row, from `sm` up. */
const GRID =
  'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,11rem)_5.5rem_5rem_2rem]';

/**
 * Settings → Dispositions: what agents pick after a call, each mapped to the
 * canonical outcome Ringee records (DISP-001). Order here is the order the
 * dialer shows them in; "Default" is what the manual dialer offers, and what a
 * campaign that picked none uses.
 */
export function DispositionsPanel() {
  const t = useTranslations('settings.dispositions');
  const data = useWorkspaceDispositions();
  const [editing, setEditing] = useState<WorkspaceDisposition | 'new' | null>(
    null
  );
  const [removing, setRemoving] = useState<WorkspaceDisposition | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fail = (error: unknown) =>
    toast.error(describeApiError(error, t('toasts.error')));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = data.dispositions.map((d) => d.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    data
      .reorder(arrayMove(ids, from, to))
      .catch((error) =>
        toast.error(describeApiError(error, t('toasts.reorderFailed')))
      );
  };

  const save = async (input: DispositionInput) => {
    try {
      if (editing && editing !== 'new') {
        await data.update(editing.id, input);
        toast.success(t('toasts.saved'));
      } else {
        await data.create(input);
        toast.success(t('toasts.created'));
      }
      setEditing(null);
    } catch (error) {
      fail(error);
    }
  };

  const patch = (
    row: WorkspaceDisposition,
    change: { isActive?: boolean; isDefault?: boolean }
  ) => {
    data.update(row.id, change).catch(fail);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await data.remove(removing.id);
      toast.success(t('toasts.deleted'));
      setRemoving(null);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <div className='space-y-5'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <p className='text-muted-foreground max-w-xl text-xs leading-relaxed'>
          {t('intro')}
        </p>
        <Button
          size='sm'
          className='shrink-0'
          disabled={data.status !== 'ready'}
          onClick={() => setEditing('new')}
        >
          <Plus className='size-4' />
          {t('new')}
        </Button>
      </div>

      {data.status === 'loading' ? (
        <div className='space-y-2'>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className='h-14 w-full rounded-lg' />
          ))}
        </div>
      ) : data.status === 'error' ? (
        <div role='alert' className='space-y-3 rounded-lg border p-4'>
          <p className='text-sm'>{t('loadError')}</p>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void data.refresh()}
          >
            {t('retry')}
          </Button>
        </div>
      ) : data.dispositions.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm'>
          {t('empty')}
        </div>
      ) : (
        <div className='space-y-2'>
          <div
            className={cn(
              GRID,
              'text-muted-foreground hidden px-3 text-xs font-medium sm:grid'
            )}
          >
            <span />
            <span>{t('columns.disposition')}</span>
            <span>{t('columns.mapsTo')}</span>
            <span className='text-center'>{t('columns.default')}</span>
            <span className='text-center'>{t('columns.active')}</span>
            <span />
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext
              items={data.dispositions.map((d) => d.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className='space-y-2'>
                {data.dispositions.map((row) => (
                  <DispositionRow
                    key={row.id}
                    row={row}
                    onEdit={() => setEditing(row)}
                    onRemove={() => setRemoving(row)}
                    onPatch={(change) => patch(row, change)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <DispositionFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        disposition={editing === 'new' ? null : editing}
        outcomes={data.outcomes}
        onSubmit={save}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('deleteDialog.title', { name: removing?.label ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDialog.description')}
              {removing && removing.campaignCount > 0
                ? ` ${t('deleteDialog.campaigns', { count: removing.campaignCount })}`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('deleteDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={(event) => {
                event.preventDefault();
                void confirmRemove();
              }}
            >
              {t('deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DispositionRow({
  row,
  onEdit,
  onRemove,
  onPatch
}: {
  row: WorkspaceDisposition;
  onEdit: () => void;
  onRemove: () => void;
  onPatch: (change: { isActive?: boolean; isDefault?: boolean }) => void;
}) {
  const t = useTranslations('settings.dispositions');
  const labels = useEnumLabels();
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging
  } = useSortable({ id: row.id });
  const outcome = labels.outcome(row.canonicalOutcome) ?? row.canonicalOutcome;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        GRID,
        'bg-card rounded-lg border px-3 py-2.5',
        !row.isActive && 'bg-muted/40',
        isDragging && 'ring-primary relative z-10 opacity-80 shadow-lg ring-2'
      )}
    >
      <button
        type='button'
        className='text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-7 cursor-grab items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing'
        aria-label={t('dragToReorder')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className='size-4' />
      </button>

      <div className='min-w-0'>
        <div className='flex min-w-0 items-center gap-2'>
          <DispositionSwatch color={row.color} />
          <span
            className={cn(
              'truncate text-sm font-medium',
              !row.isActive && 'text-muted-foreground'
            )}
          >
            {row.label}
          </span>
          {!row.isActive ? (
            <Badge variant='outline' className='shrink-0 text-[10px]'>
              {t('inactive')}
            </Badge>
          ) : null}
        </div>
        {row.description ? (
          <p className='text-muted-foreground truncate pl-5 text-xs'>
            {row.description}
          </p>
        ) : null}
        {/* Below `sm` the outcome has no column of its own. */}
        <p className='text-muted-foreground truncate pl-5 text-xs sm:hidden'>
          {t('mapsTo', { outcome })}
        </p>
      </div>

      <div className='hidden min-w-0 sm:block'>
        <Badge variant='secondary' className='max-w-full truncate font-normal'>
          {outcome}
        </Badge>
      </div>

      <div className='hidden justify-center sm:flex'>
        <Switch
          checked={row.isDefault}
          disabled={!row.isActive}
          onCheckedChange={(isDefault) => onPatch({ isDefault })}
          aria-label={t('columns.default')}
        />
      </div>

      <div className='hidden justify-center sm:flex'>
        <Switch
          checked={row.isActive}
          onCheckedChange={(isActive) => onPatch({ isActive })}
          aria-label={t('columns.active')}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='size-8'
            aria-label={t('actions')}
          >
            <MoreHorizontal className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-56'>
          <DropdownMenuItem onClick={onEdit}>{t('edit')}</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onPatch({ isActive: !row.isActive })}
          >
            {row.isActive ? t('deactivate') : t('activate')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className='sm:hidden'
            disabled={!row.isActive}
            onClick={() => onPatch({ isDefault: !row.isDefault })}
          >
            {row.isDefault ? t('removeDefault') : t('makeDefault')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant='destructive'
            disabled={row.inUse}
            onClick={onRemove}
          >
            {t('delete')}
          </DropdownMenuItem>
          {row.inUse ? (
            <p className='text-muted-foreground px-2 pb-1.5 text-[11px] leading-snug'>
              {t('deleteInUse')}
            </p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
