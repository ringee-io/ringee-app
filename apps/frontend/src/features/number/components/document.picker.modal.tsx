'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import {
  IconCircleCheckFilled,
  IconFileText,
  IconLoader2,
  IconTrash,
  IconUpload
} from '@tabler/icons-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { cn } from '@ringee/frontend-shared/lib/utils';

export interface RegulatoryDocumentDto {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function DocumentPickerModal({
  open,
  onOpenChange,
  selectedDocumentId,
  onSelect
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDocumentId?: string;
  onSelect: (doc: { id: string; filename: string }) => void;
}) {
  const t = useTranslations('settings.numbers.verify.picker');
  const api = useApi();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [docs, setDocs] = useState<RegulatoryDocumentDto[]>([]);
  const [picked, setPicked] = useState<string | undefined>(selectedDocumentId);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get<RegulatoryDocumentDto[]>(
        '/telephony/regulatory-documents'
      );
      setDocs(res);
    } catch {
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setPicked(selectedDocumentId);
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const created = await api.upload<RegulatoryDocumentDto>(
        '/telephony/regulatory-documents',
        fd
      );
      setDocs((prev) => [created, ...prev]);
      setPicked(created.id);
      toast.success(t('uploaded'));
    } catch {
      toast.error(t('uploadError'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/telephony/regulatory-documents/${id}`);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (picked === id) setPicked(undefined);
      toast.success(t('deleted'));
    } catch {
      toast.error(t('deleteError'));
    } finally {
      setDeletingId(null);
    }
  };

  const confirmSelection = () => {
    const doc = docs.find((d) => d.id === picked);
    if (!doc) return;
    onSelect({ id: doc.id, filename: doc.filename });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0'>
        <DialogHeader className='space-y-1 p-6 pb-4'>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <div className='space-y-3 px-6'>
          <button
            type='button'
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className='border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/50 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm font-medium transition-colors disabled:opacity-60'
          >
            {uploading ? (
              <IconLoader2 className='h-4 w-4 animate-spin' />
            ) : (
              <IconUpload className='h-4 w-4' />
            )}
            {uploading ? t('uploading') : t('uploadNew')}
          </button>
          <input
            ref={fileInputRef}
            type='file'
            className='hidden'
            accept='.pdf,.png,.jpg,.jpeg,.webp,.heic'
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
        </div>

        <ScrollArea className='mt-3 max-h-[40vh] flex-1 px-6'>
          {loading ? (
            <div className='flex items-center justify-center py-10'>
              <IconLoader2 className='text-muted-foreground h-5 w-5 animate-spin' />
            </div>
          ) : docs.length === 0 ? (
            <p className='text-muted-foreground py-10 text-center text-sm'>
              {t('empty')}
            </p>
          ) : (
            <ul className='space-y-2 pb-1'>
              {docs.map((doc) => {
                const isPicked = picked === doc.id;
                return (
                  <li key={doc.id}>
                    <div
                      role='button'
                      tabIndex={0}
                      onClick={() => setPicked(doc.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPicked(doc.id);
                        }
                      }}
                      className={cn(
                        'group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                        isPicked
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                          isPicked
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <IconFileText className='h-4 w-4' />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-medium'>
                          {doc.filename}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                          {formatBytes(doc.size)} ·{' '}
                          {format(new Date(doc.createdAt), 'dd MMM yyyy')}
                        </p>
                      </div>
                      {isPicked && (
                        <IconCircleCheckFilled className='text-primary h-5 w-5 shrink-0' />
                      )}
                      <button
                        type='button'
                        title={t('delete')}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(doc.id);
                        }}
                        disabled={deletingId === doc.id}
                        className='text-muted-foreground hover:bg-muted hover:text-destructive shrink-0 rounded-md p-1.5 opacity-0 transition group-hover:opacity-100'
                      >
                        {deletingId === doc.id ? (
                          <IconLoader2 className='h-4 w-4 animate-spin' />
                        ) : (
                          <IconTrash className='h-4 w-4' />
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter className='p-6 pt-4'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={confirmSelection} disabled={!picked}>
            {t('use')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
