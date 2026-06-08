'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical, IconTrash } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { Card } from '@ringee/frontend-shared/components/ui/card';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useTranslations } from 'next-intl';
import type { ScriptSection } from '../store/script.store';

type Props = {
  section: ScriptSection;
  onChange: (patch: Partial<Omit<ScriptSection, 'id'>>) => void;
  onRemove: () => void;
};

export function ScriptSectionItem({ section, onChange, onRemove }: Props) {
  const t = useTranslations('settings.script');
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-3 p-4 transition-shadow',
        isDragging && 'ring-primary opacity-60 shadow-lg ring-2'
      )}
    >
      <Button
        variant='ghost'
        size='icon'
        className='text-muted-foreground hover:text-foreground mt-1 h-8 w-8 cursor-grab active:cursor-grabbing'
        {...attributes}
        {...listeners}
        type='button'
        aria-label={t('dragToReorder')}
      >
        <IconGripVertical className='h-4 w-4' />
      </Button>

      <div className='flex flex-1 flex-col gap-3'>
        <div className='space-y-1'>
          <label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
            {t('titleLabel')}
          </label>
          <Input
            value={section.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={t('titlePlaceholder')}
          />
        </div>
        <div className='space-y-1'>
          <label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
            {t('bodyLabel')}
          </label>
          <Textarea
            value={section.body}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder={t('bodyPlaceholder')}
            rows={4}
          />
        </div>
      </div>

      <Button
        variant='ghost'
        size='icon'
        className='text-muted-foreground hover:text-destructive mt-1 h-8 w-8'
        onClick={onRemove}
        type='button'
        aria-label={t('removeSection')}
      >
        <IconTrash className='h-4 w-4' />
      </Button>
    </Card>
  );
}
