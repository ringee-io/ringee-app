'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  Upload,
  FileText,
  CheckCircle2,
  X,
  Loader2,
  Download,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  Tag,
  TagMultiSelect
} from '@/features/contact/components/tag-multi-select';

const CSV_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_ROWS: 10000
};

/** CSV column names are literal — only the human description is translated. */
const REQUIRED_FIELDS: { name: string; example: string }[] = [
  { name: 'phoneNumber', example: '+14155552671' },
  { name: 'name', example: 'John Doe' }
];

const OPTIONAL_FIELDS: { name: string; example: string }[] = [
  { name: 'email', example: 'john@acme.com' },
  { name: 'company', example: 'Acme Inc' },
  { name: 'jobTitle', example: 'Sales Manager' },
  { name: 'state', example: 'New York' },
  { name: 'website', example: 'https://acme.com' },
  {
    name: 'linkedinUrl',
    example: 'https://linkedin.com/in/john-doe'
  },
  {
    name: 'companyLinkedinUrl',
    example: 'https://linkedin.com/company/acme'
  },
  { name: 'revenue', example: '$10M-$50M' },
  { name: 'companySize', example: '51-200' },
  { name: 'location', example: 'New York' }
];

interface ImportSummary {
  totalRows: number;
  contactsCreated: number;
  leadsAdded: number;
  duplicatesSkipped: number;
  invalidRows: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

interface ImportResult {
  success: boolean;
  summary: ImportSummary;
}

type ImportState = 'idle' | 'uploading' | 'success';

interface Props {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

export function ImportLeadsModal({
  campaignId,
  open,
  onOpenChange,
  onImported
}: Props) {
  const api = useApi();
  const t = useTranslations('campaigns.csvImport');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<ImportState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;

    api
      .get<Tag[]>('/tags')
      .then(setTags)
      .catch(() => setTags([]));
  }, [open, api]);

  const resetState = useCallback(() => {
    setState('idle');
    setFile(null);
    setSummary(null);
    setError(null);
    setSelectedTagIds([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  async function handleCreateTag(name: string, color?: string): Promise<Tag> {
    const newTag = await api.post<Tag>('/tags', { name, color });
    setTags((currentTags) =>
      [...currentTags, newTag].sort((a, b) => a.name.localeCompare(b.name))
    );
    return newTag;
  }

  function handleClose(next: boolean) {
    if (!next) {
      // The parent is refreshed at import time (see handleUpload), so closing
      // only needs to reset local state.
      resetState();
      onOpenChange(false);
    } else {
      onOpenChange(true);
    }
  }

  const validateFile = useCallback(
    (f: File): string | null => {
      if (!f.name.toLowerCase().endsWith('.csv')) {
        return t('errors.notCsv');
      }
      if (f.size > CSV_CONFIG.MAX_FILE_SIZE) {
        return t('errors.tooLarge', {
          size: CSV_CONFIG.MAX_FILE_SIZE / (1024 * 1024)
        });
      }
      return null;
    },
    [t]
  );

  const handleFileSelect = useCallback(
    (selected: File) => {
      const validationError = validateFile(selected);
      if (validationError) {
        setError(validationError);
        setFile(null);
        return;
      }
      setFile(selected);
      setError(null);
    },
    [validateFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFileSelect(dropped);
    },
    [handleFileSelect]
  );

  async function handleUpload() {
    if (!file) return;
    setState('uploading');
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedTagIds.length > 0) {
        formData.append('tagIds', JSON.stringify(selectedTagIds));
      }
      const res = await api.upload<ImportResult>(
        `/campaigns/${campaignId}/leads/csv`,
        formData
      );
      setSummary(res.summary);
      setState('success');
      if (res.summary.leadsAdded > 0) {
        toast.success(t('toasts.imported', { count: res.summary.leadsAdded }));
        // Refresh the leads table / campaign counts immediately so the data
        // behind the modal is fresh regardless of how the modal is closed.
        onImported?.();
      } else {
        toast.info(t('toasts.none'));
      }
    } catch (err: any) {
      setError(err?.message || t('errors.importFailed'));
      setState('idle');
      toast.error(t('toasts.failed'));
    }
  }

  function downloadTemplate() {
    const headers = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]
      .map((f) => f.name)
      .join(',');
    const example = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]
      .map((f) => f.example)
      .join(',');
    const csv = `${headers}\n${example}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campaign_leads_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {state === 'success' && summary ? (
          <div className='space-y-4'>
            <div className='flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-green-600'>
              <CheckCircle2 className='h-5 w-5' />
              <span className='font-medium'>{t('summary.complete')}</span>
            </div>

            <div className='grid grid-cols-2 gap-3 text-sm'>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>
                  {t('summary.totalRows')}
                </div>
                <div className='text-xl font-semibold'>{summary.totalRows}</div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>
                  {t('summary.leadsAdded')}
                </div>
                <div className='text-xl font-semibold text-green-600'>
                  {summary.leadsAdded}
                </div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>
                  {t('summary.newContacts')}
                </div>
                <div className='text-xl font-semibold'>
                  {summary.contactsCreated}
                </div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>
                  {t('summary.duplicates')}
                </div>
                <div className='text-xl font-semibold text-yellow-600'>
                  {summary.duplicatesSkipped}
                </div>
              </div>
            </div>

            {summary.invalidRows > 0 && (
              <div className='border-destructive/20 rounded-lg border p-3'>
                <div className='text-destructive mb-2 flex items-center gap-2 text-sm font-medium'>
                  <AlertTriangle className='h-4 w-4' />
                  {t('summary.invalidRows', { count: summary.invalidRows })}
                </div>
                <div className='max-h-32 space-y-1 overflow-y-auto'>
                  {summary.errors.slice(0, 10).map((err, i) => (
                    <div key={i} className='text-muted-foreground text-xs'>
                      {t('summary.rowError', {
                        row: err.row,
                        message: err.message
                      })}
                    </div>
                  ))}
                  {summary.errors.length > 10 && (
                    <div className='text-muted-foreground text-xs'>
                      {t('summary.andMore', {
                        count: summary.errors.length - 10
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className='flex gap-2'>
              <Button variant='outline' className='flex-1' onClick={resetState}>
                {t('summary.importAnother')}
              </Button>
              <Button className='flex-1' onClick={() => handleClose(false)}>
                {t('summary.done')}
              </Button>
            </div>
          </div>
        ) : (
          <div className='space-y-4'>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50',
                file && 'border-green-500/50 bg-green-500/5'
              )}
            >
              <input
                ref={fileInputRef}
                type='file'
                accept='.csv'
                className='hidden'
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              {file ? (
                <>
                  <FileText className='text-primary mb-2 h-10 w-10' />
                  <span className='font-medium'>{file.name}</span>
                  <span className='text-muted-foreground text-sm'>
                    {t('dropzone.selected', {
                      size: (file.size / 1024).toFixed(1)
                    })}
                  </span>
                </>
              ) : (
                <>
                  <Upload className='text-muted-foreground mb-2 h-10 w-10' />
                  <span className='font-medium'>{t('dropzone.prompt')}</span>
                  <span className='text-muted-foreground text-sm'>
                    {t('dropzone.limits', {
                      size: CSV_CONFIG.MAX_FILE_SIZE / (1024 * 1024),
                      rows: CSV_CONFIG.MAX_ROWS.toLocaleString()
                    })}
                  </span>
                </>
              )}
            </div>

            {file && (
              <TagMultiSelect
                availableTags={tags}
                selectedTagIds={selectedTagIds}
                onSelectionChange={setSelectedTagIds}
                onCreateTag={handleCreateTag}
                placeholder={t('tagsPlaceholder')}
                className='w-full'
              />
            )}

            {/* Error message */}
            {error && (
              <div className='bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg p-3 text-sm'>
                <X className='h-4 w-4 shrink-0' />
                {error}
              </div>
            )}

            {/* Format reference */}
            <div className='bg-muted/40 rounded-lg border p-3 text-sm'>
              <div className='mb-2 flex items-center justify-between'>
                <span className='font-medium'>{t('format.title')}</span>
                <Button
                  variant='link'
                  size='sm'
                  className='h-auto p-0 text-xs'
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadTemplate();
                  }}
                >
                  <Download className='mr-1 h-3 w-3' />
                  {t('format.downloadTemplate')}
                </Button>
              </div>
              <div className='space-y-2'>
                <div>
                  <div className='mb-1 flex items-center gap-2'>
                    <Badge className='bg-green-100 text-green-700 hover:bg-green-100'>
                      {t('format.required')}
                    </Badge>
                  </div>
                  <ul className='space-y-1'>
                    {REQUIRED_FIELDS.map((f) => (
                      <li
                        key={f.name}
                        className='flex items-baseline gap-2 text-xs'
                      >
                        <code className='bg-background rounded px-1 py-0.5 font-mono'>
                          {f.name}
                        </code>
                        <span className='text-muted-foreground'>
                          {t('format.fieldHint', {
                            description: t(`format.fields.${f.name}`),
                            example: f.example
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className='mb-1 flex items-center gap-2'>
                    <Badge variant='secondary'>{t('format.optional')}</Badge>
                  </div>
                  <ul className='space-y-1'>
                    {OPTIONAL_FIELDS.map((f) => (
                      <li
                        key={f.name}
                        className='flex items-baseline gap-2 text-xs'
                      >
                        <code className='bg-background rounded px-1 py-0.5 font-mono'>
                          {f.name}
                        </code>
                        <span className='text-muted-foreground'>
                          {t('format.fieldHint', {
                            description: t(`format.fields.${f.name}`),
                            example: f.example
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className='text-muted-foreground mt-2 text-xs'>
                {t('format.note')}
              </p>
            </div>

            {/* Actions */}
            <div className='flex gap-2'>
              <Button
                variant='outline'
                className='flex-1'
                onClick={() => handleClose(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                className='flex-1'
                onClick={handleUpload}
                disabled={!file || state === 'uploading'}
              >
                {state === 'uploading' ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    {t('importing')}
                  </>
                ) : (
                  t('submit')
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
