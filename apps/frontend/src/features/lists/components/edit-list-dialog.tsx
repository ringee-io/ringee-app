'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { IconLoader2 } from '@tabler/icons-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
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
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Form } from '@ringee/frontend-shared/components/ui/form';
import { FormInput } from '@ringee/frontend-shared/components/forms/form-input';
import { FormTextarea } from '@ringee/frontend-shared/components/forms/form-textarea';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import type { ContactList } from '../types';

const NAME_MAX = 120;
const DESCRIPTION_MAX = 1000;

/** Rename a list or change its description. */
export function EditListDialog({
  list,
  open,
  onOpenChange
}: {
  list: ContactList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('lists');
  const tCommon = useTranslations('common');
  const api = useApi();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('create.nameRequired')).max(NAME_MAX),
        description: z.string().max(DESCRIPTION_MAX)
      }),
    [t]
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: list.name, description: list.description ?? '' }
  });

  useEffect(() => {
    if (open) {
      form.reset({ name: list.name, description: list.description ?? '' });
    }
  }, [open, list.name, list.description, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      await api.patch(`/contact-lists/${list.id}`, {
        name: values.name.trim(),
        description: values.description.trim()
      });
      toast.success(t('edit.saved'));
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(describeApiError(error, t('edit.failed')));
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('edit.title')}</DialogTitle>
        </DialogHeader>
        <Form form={form} onSubmit={onSubmit} className='space-y-4'>
          <FormInput
            control={form.control}
            name='name'
            label={t('create.name')}
            placeholder={t('create.namePlaceholder')}
            required
          />
          <FormTextarea
            control={form.control}
            name='description'
            label={t('create.descriptionLabel')}
            placeholder={t('create.descriptionPlaceholder')}
            config={{ rows: 3, maxLength: DESCRIPTION_MAX }}
          />
          <DialogFooter className='gap-2 sm:gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {tCommon('cancel')}
            </Button>
            <Button type='submit' disabled={saving}>
              {saving ? (
                <>
                  <IconLoader2 className='mr-2 size-4 animate-spin' />
                  {t('edit.saving')}
                </>
              ) : (
                t('edit.save')
              )}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirms deleting a list, saying plainly that its contacts stay
 * (LIST-004). `onDeleted` decides where the user goes next.
 */
export function DeleteListDialog({
  list,
  open,
  onOpenChange,
  onDeleted
}: {
  list: ContactList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations('lists.delete');
  const tCommon = useTranslations('common');
  const api = useApi();
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await api.delete(`/contact-lists/${list.id}`);
      toast.success(t('deleted', { name: list.name }));
      onOpenChange(false);
      onDeleted();
    } catch (error) {
      toast.error(describeApiError(error, t('failed')));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title', { name: list.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('description', { count: list.contactCount })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {tCommon('cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={(event) => {
              // Stays open until the server answers; a failure keeps it up.
              event.preventDefault();
              void confirm();
            }}
            className='bg-destructive hover:bg-destructive/90 text-white'
          >
            {deleting ? t('deleting') : t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
