'use client';

import { useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Send, ClipboardList, Loader2, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface CrmSyncActionsProps {
  contactId: string;
}

export function CrmSyncActions({ contactId }: CrmSyncActionsProps) {
  const t = useTranslations('contacts.crmActions');
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  return (
    <>
      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setNoteDialogOpen(true)}
        >
          <Send className='mr-1.5 h-3.5 w-3.5' />
          {t('pushNote')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setTaskDialogOpen(true)}
        >
          <ClipboardList className='mr-1.5 h-3.5 w-3.5' />
          {t('pushTask')}
        </Button>
      </div>

      <PushNoteDialog
        contactId={contactId}
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
      />
      <PushTaskDialog
        contactId={contactId}
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
      />
    </>
  );
}

function PushNoteDialog({
  contactId,
  open,
  onOpenChange
}: {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const t = useTranslations('contacts.crmActions.note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setLoading(true);
    try {
      await api.post(`/crm/contacts/${contactId}/sync-note`, {
        title: title.trim() || undefined,
        body: body.trim()
      });
      toast.success(t('queued'));
      setTitle('');
      setBody('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ArrowUpRight className='h-4 w-4' />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <label className='text-sm font-medium'>{t('titleLabel')}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
            />
          </div>
          <div className='space-y-1.5'>
            <label className='text-sm font-medium'>{t('bodyLabel')}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={t('bodyPlaceholder')}
              className='border-input bg-background ring-offset-background focus:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none'
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!body.trim() || loading}>
            {loading ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : (
              <Send className='mr-1.5 h-3.5 w-3.5' />
            )}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PushTaskDialog({
  contactId,
  open,
  onOpenChange
}: {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const t = useTranslations('contacts.crmActions.task');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      await api.post(`/crm/contacts/${contactId}/sync-task`, {
        title: title.trim(),
        body: body.trim() || undefined,
        dueAt: dueAt || undefined,
        assigneeEmail: assigneeEmail.trim() || undefined
      });
      toast.success(t('queued'));
      setTitle('');
      setBody('');
      setDueAt('');
      setAssigneeEmail('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ClipboardList className='h-4 w-4' />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <label className='text-sm font-medium'>{t('titleLabel')}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
            />
          </div>
          <div className='space-y-1.5'>
            <label className='text-sm font-medium'>
              {t('descriptionLabel')}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder={t('descriptionPlaceholder')}
              className='border-input bg-background ring-offset-background focus:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none'
            />
          </div>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <label className='text-sm font-medium'>{t('dueDate')}</label>
              <Input
                type='datetime-local'
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
            <div className='space-y-1.5'>
              <label className='text-sm font-medium'>
                {t('assigneeEmail')}
              </label>
              <Input
                value={assigneeEmail}
                onChange={(e) => setAssigneeEmail(e.target.value)}
                placeholder='teammate@company.com'
                type='email'
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || loading}>
            {loading ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : (
              <ClipboardList className='mr-1.5 h-3.5 w-3.5' />
            )}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
