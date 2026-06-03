'use client';

import { useCallback, useRef, useState } from 'react';
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

const CSV_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_ROWS: 10000
};

const REQUIRED_FIELDS: {
  name: string;
  description: string;
  example: string;
}[] = [
  {
    name: 'phoneNumber',
    description: 'E.164 phone number',
    example: '+14155552671'
  },
  { name: 'name', description: 'Full contact name', example: 'John Doe' }
];

const OPTIONAL_FIELDS: {
  name: string;
  description: string;
  example: string;
}[] = [
  { name: 'email', description: 'Contact email', example: 'john@acme.com' },
  { name: 'company', description: 'Company name', example: 'Acme Inc' }
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<ImportState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const resetState = useCallback(() => {
    setState('idle');
    setFile(null);
    setSummary(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

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

  function validateFile(f: File): string | null {
    if (!f.name.toLowerCase().endsWith('.csv')) {
      return 'Only .csv files are accepted.';
    }
    if (f.size > CSV_CONFIG.MAX_FILE_SIZE) {
      return `File is too large. Maximum size is ${CSV_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB.`;
    }
    return null;
  }

  const handleFileSelect = useCallback((selected: File) => {
    const validationError = validateFile(selected);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }
    setFile(selected);
    setError(null);
  }, []);

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
      const res = await api.upload<ImportResult>(
        `/campaigns/${campaignId}/leads/csv`,
        formData
      );
      setSummary(res.summary);
      setState('success');
      if (res.summary.leadsAdded > 0) {
        toast.success(
          `Imported ${res.summary.leadsAdded} lead(s) successfully.`
        );
        // Refresh the leads table / campaign counts immediately so the data
        // behind the modal is fresh regardless of how the modal is closed.
        onImported?.();
      } else {
        toast.info('No new leads were added.');
      }
    } catch (err: any) {
      setError(
        err?.message ||
          'Failed to import leads. Please check your file and try again.'
      );
      setState('idle');
      toast.error('Lead import failed.');
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
          <DialogTitle>Import Leads from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to add leads to this campaign. New contacts are
            created automatically and duplicates are skipped.
          </DialogDescription>
        </DialogHeader>

        {state === 'success' && summary ? (
          <div className='space-y-4'>
            <div className='flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-green-600'>
              <CheckCircle2 className='h-5 w-5' />
              <span className='font-medium'>Import complete</span>
            </div>

            <div className='grid grid-cols-2 gap-3 text-sm'>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>Total rows</div>
                <div className='text-xl font-semibold'>{summary.totalRows}</div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>Leads added</div>
                <div className='text-xl font-semibold text-green-600'>
                  {summary.leadsAdded}
                </div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>New contacts</div>
                <div className='text-xl font-semibold'>
                  {summary.contactsCreated}
                </div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>Duplicates skipped</div>
                <div className='text-xl font-semibold text-yellow-600'>
                  {summary.duplicatesSkipped}
                </div>
              </div>
            </div>

            {summary.invalidRows > 0 && (
              <div className='border-destructive/20 rounded-lg border p-3'>
                <div className='text-destructive mb-2 flex items-center gap-2 text-sm font-medium'>
                  <AlertTriangle className='h-4 w-4' />
                  {summary.invalidRows} invalid row(s) were skipped
                </div>
                <div className='max-h-32 space-y-1 overflow-y-auto'>
                  {summary.errors.slice(0, 10).map((err, i) => (
                    <div key={i} className='text-muted-foreground text-xs'>
                      Row {err.row}: {err.message}
                    </div>
                  ))}
                  {summary.errors.length > 10 && (
                    <div className='text-muted-foreground text-xs'>
                      …and {summary.errors.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className='flex gap-2'>
              <Button variant='outline' className='flex-1' onClick={resetState}>
                Import another file
              </Button>
              <Button className='flex-1' onClick={() => handleClose(false)}>
                Done
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
                    {(file.size / 1024).toFixed(1)} KB — click to choose another
                  </span>
                </>
              ) : (
                <>
                  <Upload className='text-muted-foreground mb-2 h-10 w-10' />
                  <span className='font-medium'>
                    Drop your CSV here or click to browse
                  </span>
                  <span className='text-muted-foreground text-sm'>
                    Max {CSV_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB •{' '}
                    {CSV_CONFIG.MAX_ROWS.toLocaleString()} rows
                  </span>
                </>
              )}
            </div>

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
                <span className='font-medium'>Required file format</span>
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
                  Download template
                </Button>
              </div>
              <div className='space-y-2'>
                <div>
                  <div className='mb-1 flex items-center gap-2'>
                    <Badge className='bg-green-100 text-green-700 hover:bg-green-100'>
                      Required
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
                          {f.description} (e.g. {f.example})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className='mb-1 flex items-center gap-2'>
                    <Badge variant='secondary'>Optional</Badge>
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
                          {f.description} (e.g. {f.example})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className='text-muted-foreground mt-2 text-xs'>
                The first row must contain the column headers above. Column
                order does not matter and headers are case-insensitive.
              </p>
            </div>

            {/* Actions */}
            <div className='flex gap-2'>
              <Button
                variant='outline'
                className='flex-1'
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button
                className='flex-1'
                onClick={handleUpload}
                disabled={!file || state === 'uploading'}
              >
                {state === 'uploading' ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Importing…
                  </>
                ) : (
                  'Import Leads'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
