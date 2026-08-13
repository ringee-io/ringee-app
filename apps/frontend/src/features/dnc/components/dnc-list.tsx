'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Plus, Trash2, Upload, Search, ShieldBan, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface DNCEntry {
  id: string;
  phoneNumber: string;
  reason: string | null;
  source: string | null;
  createdAt: string;
}

interface DNCListResponse {
  data: DNCEntry[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function DNCList() {
  const api = useApi();
  const t = useTranslations('calls.dnc.list');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<DNCEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const limit = 20;

  useEffect(() => {
    loadEntries();
  }, [page]);

  async function loadEntries() {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (search) params.search = search;
      const res = await api.get<DNCListResponse>('/dnc', params);
      setEntries(res.data);
      setTotal(res.meta.total);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    setPage(1);
    loadEntries();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhone.trim()) return;
    setSaving(true);
    try {
      await api.post('/dnc', {
        phoneNumber: newPhone.trim(),
        reason: newReason || undefined,
        source: 'manual'
      });
      setDialogOpen(false);
      setNewPhone('');
      setNewReason('');
      await loadEntries();
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/dnc/${id}`);
      await loadEntries();
    } catch {
      // handled
    }
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.upload('/dnc/import', formData);
      await loadEntries();
    } catch {
      // handled
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>
              {t('description', { count: total })}
            </CardDescription>
          </div>
          <div className='flex items-center gap-2'>
            <input
              ref={fileInputRef}
              type='file'
              accept='.csv'
              className='hidden'
              onChange={handleCsvImport}
            />
            <Button
              variant='outline'
              size='sm'
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Upload className='mr-2 h-4 w-4' />
              )}
              {t('importCsv')}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size='sm'>
                  <Plus className='mr-2 h-4 w-4' />
                  {t('addNumber')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('dialog.title')}</DialogTitle>
                  <DialogDescription>
                    {t('dialog.description')}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAdd} className='space-y-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='dnc-phone'>{t('dialog.phone')}</Label>
                    <Input
                      id='dnc-phone'
                      placeholder='+1234567890'
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='dnc-reason'>{t('dialog.reason')}</Label>
                    <Input
                      id='dnc-reason'
                      placeholder={t('dialog.reasonPlaceholder')}
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                    />
                  </div>
                  <div className='flex justify-end gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => setDialogOpen(false)}
                    >
                      {t('dialog.cancel')}
                    </Button>
                    <Button type='submit' disabled={saving}>
                      {saving && (
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      )}
                      {t('dialog.add')}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className='mb-4 flex gap-2'>
          <div className='relative flex-1'>
            <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
            <Input
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className='pl-9'
            />
          </div>
        </div>

        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className='flex flex-col items-center py-12 text-center'>
            <ShieldBan className='text-muted-foreground mb-4 h-12 w-12' />
            <h3 className='text-lg font-semibold'>{t('empty.title')}</h3>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('empty.description')}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.phone')}</TableHead>
                  <TableHead>{t('columns.reason')}</TableHead>
                  <TableHead className='hidden md:table-cell'>
                    {t('columns.source')}
                  </TableHead>
                  <TableHead className='hidden sm:table-cell'>
                    {t('columns.added')}
                  </TableHead>
                  <TableHead className='w-[60px]'></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className='font-mono'>
                      {entry.phoneNumber}
                    </TableCell>
                    <TableCell>{entry.reason || '—'}</TableCell>
                    <TableCell className='hidden md:table-cell'>
                      {entry.source || '—'}
                    </TableCell>
                    <TableCell className='hidden sm:table-cell'>
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => handleDelete(entry.id)}
                      >
                        <Trash2 className='text-muted-foreground h-4 w-4' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className='mt-4 flex items-center justify-between'>
                <p className='text-muted-foreground text-sm'>
                  {t('pagination', { page, totalPages })}
                </p>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    {t('previous')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    {t('next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
