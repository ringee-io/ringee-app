'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { IconLoader2, IconX } from '@tabler/icons-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Form } from '@ringee/frontend-shared/components/ui/form';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { FormInput } from '@ringee/frontend-shared/components/forms/form-input';
import { FormTextarea } from '@ringee/frontend-shared/components/forms/form-textarea';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import {
  CsvDropzone,
  CsvFormatHelp
} from '@/features/contact/components/csv-import-fields';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import type { ContactList, ContactListImportSummary } from '../types';
import { AssigneeSelect } from './assignee-select';
import { ListImportSummary } from './list-import-summary';

const NAME_MAX = 120;
const DESCRIPTION_MAX = 1000;

interface CreateListResponse {
  list: ContactList;
  import: ContactListImportSummary | null;
}

/**
 * A new list: name, description, who works it and, optionally, a CSV that
 * fills it in the same request. Lands on the new list unless the file had rows
 * to skip, which are shown first.
 */
export function CreateListDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('lists.create');
  const tCommon = useTranslations('common');
  const api = useApi();
  const router = useRouter();
  const { hasOrg, isOrgAdmin } = useOrgRole();
  const canAssign = hasOrg && isOrgAdmin;

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('nameRequired')).max(NAME_MAX),
        description: z.string().max(DESCRIPTION_MAX)
      }),
    [t]
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' }
  });

  const [assignee, setAssignee] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    list: ContactList;
    summary: ContactListImportSummary;
  } | null>(null);

  const close = () => {
    form.reset();
    setAssignee(null);
    setFile(null);
    setFileError(null);
    setResult(null);
    onOpenChange(false);
  };

  const openList = (list: ContactList) => {
    close();
    router.push(`/dashboard/lists/${list.id}`);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append('name', values.name.trim());
      if (values.description.trim()) {
        body.append('description', values.description.trim());
      }
      if (canAssign && assignee) body.append('assignedToId', assignee);
      if (file) body.append('file', file);

      const created = await api.upload<CreateListResponse>(
        '/contact-lists',
        body
      );
      const name = created.list.name;
      if (created.import && created.import.invalidRows > 0) {
        setResult({ list: created.list, summary: created.import });
        return;
      }
      toast.success(
        created.import
          ? t('createdWithContacts', {
              name,
              count: created.import.addedToList
            })
          : t('created', { name })
      );
      openList(created.list);
    } catch (error) {
      toast.error(describeApiError(error, t('failed')));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className='max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          {!result ? (
            <DialogDescription>{t('description')}</DialogDescription>
          ) : null}
        </DialogHeader>

        {result ? (
          <div className='space-y-4'>
            <ListImportSummary summary={result.summary} />
            <Button className='w-full' onClick={() => openList(result.list)}>
              {t('openList')}
            </Button>
          </div>
        ) : (
          <Form form={form} onSubmit={onSubmit} className='space-y-4'>
            <FormInput
              control={form.control}
              name='name'
              label={t('name')}
              placeholder={t('namePlaceholder')}
              required
            />
            <FormTextarea
              control={form.control}
              name='description'
              label={t('descriptionLabel')}
              placeholder={t('descriptionPlaceholder')}
              config={{ rows: 2, maxLength: DESCRIPTION_MAX }}
            />

            {canAssign ? (
              <div className='space-y-2'>
                <Label htmlFor='list-assignee'>{t('assignTo')}</Label>
                <AssigneeSelect
                  id='list-assignee'
                  value={assignee}
                  onChange={setAssignee}
                  className='w-full'
                />
                <p className='text-muted-foreground text-xs'>
                  {t('assignToHint')}
                </p>
              </div>
            ) : null}

            <div className='space-y-2'>
              <Label>{t('csv')}</Label>
              <CsvDropzone
                file={file}
                onFileChange={(picked) => {
                  setFile(picked);
                  setFileError(null);
                }}
                onError={setFileError}
                className='p-5'
              />
              {fileError ? (
                <p className='text-destructive flex items-center gap-1.5 text-sm'>
                  <IconX className='size-4' />
                  {fileError}
                </p>
              ) : null}
              <CsvFormatHelp />
            </div>

            <DialogFooter className='gap-2 sm:gap-2'>
              <Button type='button' variant='outline' onClick={close}>
                {tCommon('cancel')}
              </Button>
              <Button type='submit' disabled={submitting}>
                {submitting ? (
                  <>
                    <IconLoader2 className='mr-2 size-4 animate-spin' />
                    {t('creating')}
                  </>
                ) : (
                  t('submit')
                )}
              </Button>
            </DialogFooter>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
