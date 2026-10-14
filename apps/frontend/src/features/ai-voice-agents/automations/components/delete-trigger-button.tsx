'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { describeApiError } from '../../lib/api-error';
import { useAutomationApi } from '../api';
import type { AutomationAgent, AutomationCard } from '../types';

/**
 * "Delete trigger" on a configured card — shown to admins, refused by the
 * server to anyone else. The card comes back not set up; its agent stays
 * among the workspace's agents, and the next setup offers it again. When a
 * receptionist's number cannot be handed back nothing is removed, and the
 * dialog stays open to say why.
 */
export function DeleteTriggerButton({
  card,
  agent,
  onDeleted,
  className
}: {
  card: AutomationCard;
  agent: AutomationAgent;
  onDeleted: (card: AutomationCard) => void;
  className?: string;
}) {
  const t = useTranslations('aiVoiceAgents.automations');
  const tCommon = useTranslations('aiVoiceAgents.common');
  const api = useAutomationApi();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = t(`capabilities.${card.capability}.title`);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      const updated = await api.removeAutomation(card.capability);
      setOpen(false);
      toast.success(t('toast.triggerDeleted', { title }));
      onDeleted(updated);
    } catch (failure) {
      setError(describeApiError(failure, t('toast.triggerDeleteError')));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          size='sm'
          variant='ghost'
          className={cn(
            'text-destructive hover:text-destructive h-11 rounded-lg md:h-8',
            className
          )}
        >
          <Trash2 className='size-3.5' />
          {t('deleteTrigger.button')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('deleteTrigger.title', { title })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(`deleteTrigger.hint.${card.capability}`, { name: agent.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role='alert' className='text-destructive text-sm'>
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className='rounded-lg' disabled={deleting}>
            {tCommon('cancel')}
          </AlertDialogCancel>
          <Button
            variant='destructive'
            className='rounded-lg'
            disabled={deleting}
            onClick={() => void remove()}
          >
            {deleting ? <Loader2 className='size-4 animate-spin' /> : null}
            {t('deleteTrigger.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
