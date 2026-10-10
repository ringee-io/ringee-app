'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useRouter } from 'next/navigation';
import { IconCheck, IconX, IconLoader2 } from '@tabler/icons-react';
import { toast } from 'sonner';
import { TagMultiSelect, Tag } from './tag-multi-select';
import { useTranslations } from 'next-intl';
import { CsvDropzone, CsvFormatHelp } from './csv-import-fields';

interface ImportCsvModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportSummary {
  totalRows: number;
  inserted: number;
  duplicatesSkipped: number;
  invalidRows: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

type ImportState = 'idle' | 'uploading' | 'success' | 'error';

export function ImportCsvModal({ open, onOpenChange }: ImportCsvModalProps) {
  const api = useApi();
  const router = useRouter();
  const t = useTranslations('contacts.import');
  const tCommon = useTranslations('common');

  const [state, setState] = useState<ImportState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tag selection state
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  // Fetch tags when modal opens
  useEffect(() => {
    if (open) {
      api
        .get<Tag[]>('/tags')
        .then(setTags)
        .catch(() => setTags([]));
    }
  }, [open, api]);

  const resetState = useCallback(() => {
    setState('idle');
    setFile(null);
    setSummary(null);
    setError(null);
    setSelectedTagIds([]);
    setPopoverOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onOpenChange(false);
    if (summary && summary.inserted > 0) {
      router.refresh();
    }
  }, [resetState, onOpenChange, router, summary]);

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleCreateTag = async (
    name: string,
    color?: string
  ): Promise<Tag> => {
    try {
      // Assign a random color if not provided
      const colors = [
        '#ef4444', // red
        '#f97316', // orange
        '#f59e0b', // amber
        '#22c55e', // green
        '#3b82f6', // blue
        '#6366f1', // indigo
        '#a855f7', // purple
        '#ec4899' // pink
      ];
      // Use color from argument or random fallback
      const randomColor =
        color || colors[Math.floor(Math.random() * colors.length)];

      const newTag = await api.post<Tag>('/tags', {
        name,
        color: randomColor
      });
      setTags((prev) => [
        ...prev.sort((a, b) => a.name.localeCompare(b.name)),
        newTag
      ]);
      // Search value is cleared inside TagMultiSelect
      return newTag;
    } catch (err) {
      toast.error(t('failedToCreateTag'));
      throw err;
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setState('uploading');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Add selected tags to form data
      if (selectedTagIds.length > 0) {
        formData.append('tagIds', JSON.stringify(selectedTagIds));
      }

      const response = await api.upload('/contacts/import', formData);

      setSummary(response.summary);
      setState('success');
      toast.success(
        t('successfullyImported', { count: response.summary.inserted })
      );
    } catch (err: any) {
      setError(err.message || t('importFailed'));
      setState('error');
      toast.error(t('importFailed'));
    }
  };

  const getTagColor = (color?: string | null) => color || '#3B82F6';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('titleExtended')}</DialogTitle>
          <DialogDescription>{t('descriptionExtended')}</DialogDescription>
        </DialogHeader>

        {state === 'success' && summary ? (
          <div className='space-y-4'>
            <div className='rounded-lg border border-green-500/20 bg-green-500/10 p-4'>
              <div className='flex items-center gap-2 text-green-500'>
                <IconCheck className='h-5 w-5' />
                <span className='font-medium'>{t('importComplete')}</span>
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3 text-sm'>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>{t('totalRows')}</div>
                <div className='text-xl font-semibold'>{summary.totalRows}</div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>{t('inserted')}</div>
                <div className='text-xl font-semibold text-green-500'>
                  {summary.inserted}
                </div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>
                  {t('duplicatesSkipped')}
                </div>
                <div className='text-xl font-semibold text-yellow-500'>
                  {summary.duplicatesSkipped}
                </div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>{t('invalidRows')}</div>
                <div className='text-xl font-semibold text-red-500'>
                  {summary.invalidRows}
                </div>
              </div>
            </div>

            {summary.errors.length > 0 && (
              <div className='border-destructive/20 max-h-32 overflow-y-auto rounded-lg border p-3'>
                <div className='text-destructive mb-2 text-sm font-medium'>
                  {t('errors')} ({summary.errors.length})
                </div>
                {summary.errors.slice(0, 10).map((err, i) => (
                  <div key={i} className='text-muted-foreground text-xs'>
                    {t('row')} {err.row}: {err.message}
                  </div>
                ))}
              </div>
            )}

            <Button onClick={handleClose} className='w-full'>
              {t('done')}
            </Button>
          </div>
        ) : (
          <div className='space-y-4'>
            <CsvDropzone
              file={file}
              onFileChange={(selected) => {
                setFile(selected);
                setError(null);
              }}
              onError={setError}
            />

            {/* Tag Selection - using reusable component */}
            {file && (
              <TagMultiSelect
                availableTags={tags}
                selectedTagIds={selectedTagIds}
                onSelectionChange={setSelectedTagIds}
                onCreateTag={handleCreateTag}
                placeholder={t('assignTagsPlaceholder')}
                className='w-full'
              />
            )}
            {/* Error Message */}
            {error && (
              <div className='bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg p-3 text-sm'>
                <IconX className='h-4 w-4' />
                {error}
              </div>
            )}

            <CsvFormatHelp />

            {/* Actions */}
            <div className='flex gap-2'>
              <Button
                variant='outline'
                onClick={handleClose}
                className='flex-1'
              >
                {tCommon('cancel')}
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || state === 'uploading'}
                className='flex-1'
              >
                {state === 'uploading' ? (
                  <>
                    <IconLoader2 className='mr-2 h-4 w-4 animate-spin' />
                    {t('importing')}
                  </>
                ) : (
                  t('importContacts')
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
