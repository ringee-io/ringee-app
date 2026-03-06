'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useRouter } from 'next/navigation';
import {
  IconUpload,
  IconFileTypeCsv,
  IconCheck,
  IconX,
  IconLoader2,
  IconDownload,
  IconTag,
  IconChevronDown,
  IconPlus
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { TagMultiSelect, Tag } from './tag-multi-select';

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

// CSV configuration constants
const CSV_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_ROWS: 10000
};

const REQUIRED_FIELDS = ['phoneNumber', 'name'];
const OPTIONAL_FIELDS = ['email', 'company'];

export function ImportCsvModal({ open, onOpenChange }: ImportCsvModalProps) {
  const api = useApi();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<ImportState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Tag selection state
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  // Fetch tags when modal opens
  useEffect(() => {
    if (open) {
      api.get<Tag[]>('/tags').then(setTags).catch(() => setTags([]));
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

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return 'Only CSV files are allowed';
    }
    if (file.size > CSV_CONFIG.MAX_FILE_SIZE) {
      return `File size exceeds ${CSV_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB limit`;
    }
    return null;
  };

  const handleFileSelect = useCallback((selectedFile: File) => {
    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFile(selectedFile);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleCreateTag = async (name: string, color?: string): Promise<Tag> => {
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
        '#ec4899', // pink
      ];
      // Use color from argument or random fallback
      const randomColor = color || colors[Math.floor(Math.random() * colors.length)];
      
      const newTag = await api.post<Tag>('/tags', { 
        name,
        color: randomColor
      });
      setTags(prev => [...prev.sort((a, b) => a.name.localeCompare(b.name)), newTag]);
      // Search value is cleared inside TagMultiSelect
      return newTag;
    } catch (err) {
      toast.error('Failed to create tag');
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
      toast.success(`Successfully imported ${response.summary.inserted} contacts`);
    } catch (err: any) {
      setError(err.message || 'Failed to import contacts');
      setState('error');
      toast.error('Import failed');
    }
  };

  const downloadTemplate = () => {
    const headers = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].join(',');
    const example = '+1234567890,John Doe,john@example.com,Acme Inc';
    const csv = `${headers}\n${example}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getTagColor = (color?: string | null) => color || '#3B82F6';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk import contacts
          </DialogDescription>
        </DialogHeader>

        {state === 'success' && summary ? (
          <div className='space-y-4'>
            <div className='bg-green-500/10 border-green-500/20 rounded-lg border p-4'>
              <div className='flex items-center gap-2 text-green-500'>
                <IconCheck className='h-5 w-5' />
                <span className='font-medium'>Import Complete</span>
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3 text-sm'>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>Total Rows</div>
                <div className='text-xl font-semibold'>{summary.totalRows}</div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>Inserted</div>
                <div className='text-xl font-semibold text-green-500'>
                  {summary.inserted}
                </div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>Duplicates Skipped</div>
                <div className='text-xl font-semibold text-yellow-500'>
                  {summary.duplicatesSkipped}
                </div>
              </div>
              <div className='bg-muted rounded-lg p-3'>
                <div className='text-muted-foreground'>Invalid Rows</div>
                <div className='text-xl font-semibold text-red-500'>
                  {summary.invalidRows}
                </div>
              </div>
            </div>

            {summary.errors.length > 0 && (
              <div className='border-destructive/20 max-h-32 overflow-y-auto rounded-lg border p-3'>
                <div className='text-destructive mb-2 text-sm font-medium'>
                  Errors ({summary.errors.length})
                </div>
                {summary.errors.slice(0, 10).map((err, i) => (
                  <div key={i} className='text-muted-foreground text-xs'>
                    Row {err.row}: {err.message}
                  </div>
                ))}
              </div>
            )}

            <Button onClick={handleClose} className='w-full'>
              Done
            </Button>
          </div>
        ) : (
          <div className='space-y-4'>
            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
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
                  <IconFileTypeCsv className='text-primary mb-2 h-10 w-10' />
                  <span className='font-medium'>{file.name}</span>
                  <span className='text-muted-foreground text-sm'>
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </>
              ) : (
                <>
                  <IconUpload className='text-muted-foreground mb-2 h-10 w-10' />
                  <span className='font-medium'>
                    Drop CSV file here or click to browse
                  </span>
                  <span className='text-muted-foreground text-sm'>
                    Max {CSV_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB •{' '}
                    {CSV_CONFIG.MAX_ROWS.toLocaleString()} rows
                  </span>
                </>
              )}
            </div>

            {/* Tag Selection - using reusable component */}
            {file && (
              <TagMultiSelect
                availableTags={tags}
                selectedTagIds={selectedTagIds}
                onSelectionChange={setSelectedTagIds}
                onCreateTag={handleCreateTag}
                placeholder="Assign tags to imported contacts"
                className="w-full"
              />
            )}
            {/* Error Message */}
            {error && (
              <div className='bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg p-3 text-sm'>
                <IconX className='h-4 w-4' />
                {error}
              </div>
            )}

            {/* Format Info */}
            <div className='bg-muted/50 rounded-lg p-3 text-sm'>
              <div className='mb-2 font-medium'>CSV Format Requirements</div>
              <div className='space-y-1 text-xs'>
                <div>
                  <span className='text-green-500'>✓ Required:</span>{' '}
                  {REQUIRED_FIELDS.join(', ')}
                </div>
                <div>
                  <span className='text-muted-foreground'>○ Optional:</span>{' '}
                  {OPTIONAL_FIELDS.join(', ')}
                </div>
              </div>
              <Button
                variant='link'
                size='sm'
                className='mt-2 h-auto p-0 text-xs'
                onClick={(e) => {
                  e.stopPropagation();
                  downloadTemplate();
                }}
              >
                <IconDownload className='mr-1 h-3 w-3' />
                Download template
              </Button>
            </div>

            {/* Actions */}
            <div className='flex gap-2'>
              <Button
                variant='outline'
                onClick={handleClose}
                className='flex-1'
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || state === 'uploading'}
                className='flex-1'
              >
                {state === 'uploading' ? (
                  <>
                    <IconLoader2 className='mr-2 h-4 w-4 animate-spin' />
                    Importing...
                  </>
                ) : (
                  'Import Contacts'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

