'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useTranslations } from 'next-intl';

interface CreateNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note: string) => Promise<void> | void;
  loading?: boolean;
  title?: string;
  contactId: string;
  description?: string;
}

export function CreateNoteModal({
  open,
  onOpenChange,
  onSave,
  title,
  description,
  contactId
}: CreateNoteModalProps) {
  const api = useApi();
  const t = useTranslations('contacts.fields');
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!noteText.trim()) return;

    try {
      setLoading(true);
      const response = await api.post(`/contacts/${contactId}/notes`, {
        content: noteText
      });

      await onSave(response.id);

      setNoteText('');
      setLoading(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? t('addNote')}</DialogTitle>
          <DialogDescription>
            {description ?? t('addNoteDescription')}
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          placeholder={t('writeNotePlaceholder')}
          className={cn(
            'border-input w-full rounded-md border bg-transparent p-2 text-sm',
            'focus:ring-primary focus:ring-2 focus:outline-none'
          )}
        />

        <DialogFooter>
          <Button
            variant='secondary'
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!noteText.trim() || loading}>
            {loading ? t('saving') : t('saveNote')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
