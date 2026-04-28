'use client';

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { IconPlus } from '@tabler/icons-react';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useScriptStore } from '../store/script.store';
import { useScriptSync } from '../hooks/use-script-sync';
import { ScriptSectionItem } from './script-section-item';

export function ScriptEditor() {
  const { sections, status, saving } = useScriptSync();
  const addSection = useScriptStore((s) => s.addSection);
  const updateSection = useScriptStore((s) => s.updateSection);
  const removeSection = useScriptStore((s) => s.removeSection);
  const reorderSections = useScriptStore((s) => s.reorderSections);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove(sections, oldIndex, newIndex);
    reorderSections(next.map((s) => s.id));
  };

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-lg font-semibold'>Guion general</h3>
          <p className='text-muted-foreground text-sm'>
            Crea las secciones de tu guion. Arrastra para reordenarlas.
          </p>
        </div>
        <div className='flex items-center gap-3'>
          {saving && (
            <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
              <Loader2 className='h-3 w-3 animate-spin' />
              Guardando...
            </span>
          )}
          <Button
            onClick={() => addSection()}
            size='sm'
            type='button'
            disabled={isLoading}
          >
            <IconPlus className='mr-1 h-4 w-4' />
            Agregar sección
          </Button>
        </div>
      </div>

      {status === 'error' ? (
        <div className='border-destructive/40 text-destructive rounded-lg border border-dashed p-6 text-center text-sm'>
          No se pudo cargar tu guion. Recarga la página para intentarlo de nuevo.
        </div>
      ) : isLoading ? (
        <div className='space-y-3'>
          <Skeleton className='h-32 w-full' />
          <Skeleton className='h-32 w-full' />
        </div>
      ) : sections.length === 0 ? (
        <div className='border-border/50 text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm'>
          Aún no tienes secciones. Agrega la primera para empezar tu guion.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={sections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className='space-y-3'>
              {sections.map((section) => (
                <ScriptSectionItem
                  key={section.id}
                  section={section}
                  onChange={(patch) => updateSection(section.id, patch)}
                  onRemove={() => removeSection(section.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
