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
  title = 'Add Note',
  description = 'Write a new note for this contact.',
  contactId
}: CreateNoteModalProps) {
  const api = useApi();
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          placeholder='Write your note...'
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
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!noteText.trim() || loading}>
            {loading ? 'Saving...' : 'Save Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
