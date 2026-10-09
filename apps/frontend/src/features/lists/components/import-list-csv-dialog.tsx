'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  CsvDropzone,
  CsvFormatHelp
} from '@/features/contact/components/csv-import-fields';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import type { ContactList, ContactListImportSummary } from '../types';
import { ListImportSummary } from './list-import-summary';

/** Uploads one more contacts CSV into a list (LIST-003). */
export function ImportListCsvDialog({
  list,
  open,
  onOpenChange
}: {
  list: ContactList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('lists.import');
  const tCommon = useTranslations('common');
  const api = useApi();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ContactListImportSummary | null>(null);

  const close = () => {
    setFile(null);
    setError(null);
    setSummary(null);
    onOpenChange(false);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const result = await api.upload<ContactListImportSummary>(
        `/contact-lists/${list.id}/import`,
        body
      );
      setSummary(result);
      router.refresh();
    } catch (failure) {
      const message = describeApiError(failure, t('failed'));
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className='max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          {!summary ? (
            <DialogDescription>{t('description')}</DialogDescription>
          ) : null}
        </DialogHeader>

        {summary ? (
          <div className='space-y-4'>
            <ListImportSummary summary={summary} />
            <Button className='w-full' onClick={close}>
              {t('done')}
            </Button>
          </div>
        ) : (
          <div className='space-y-4'>
            <CsvDropzone
              file={file}
              onFileChange={(picked) => {
                setFile(picked);
                setError(null);
              }}
              onError={setError}
            />
            {error ? (
              <div className='bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg p-3 text-sm'>
                <IconX className='size-4 shrink-0' />
                {error}
              </div>
            ) : null}
            <CsvFormatHelp />
            <DialogFooter className='gap-2 sm:gap-2'>
              <Button variant='outline' onClick={close}>
                {tCommon('cancel')}
              </Button>
              <Button
                onClick={() => void upload()}
                disabled={!file || uploading}
              >
                {uploading ? (
                  <>
                    <IconLoader2 className='mr-2 size-4 animate-spin' />
                    {t('uploading')}
                  </>
                ) : (
                  t('submit')
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
