'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
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
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  TableActionCell,
  TableActionHead
} from '@ringee/frontend-shared/components/ui/table/table-action-column';
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
import { Plus, Trash2, Loader2 } from 'lucide-react';
import type { Disposition, DispositionCategory } from '../types/campaign.types';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

const CATEGORY_COLORS: Record<DispositionCategory, string> = {
  positive: 'bg-green-100 text-green-700',
  neutral: 'bg-blue-100 text-blue-700',
  negative: 'bg-red-100 text-red-700',
  no_contact: 'bg-gray-100 text-gray-700'
};

interface Props {
  campaignId: string;
  /** Org admins (and freelancers) can add/delete dispositions; members are read-only. */
  canManage?: boolean;
}

export function CampaignDispositionsTab({
  campaignId,
  canManage = false
}: Props) {
  const api = useApi();
  const t = useTranslations('campaigns');
  const tCommon = useTranslations('common');
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Disposition | null>(null);

  const [newDispo, setNewDispo] = useState({
    code: '',
    label: '',
    category: 'neutral' as DispositionCategory,
    color: '#3B82F6',
    triggersRetry: false,
    triggersCompletion: false,
    triggersDnc: false,
    triggersCallback: false
  });

  useEffect(() => {
    loadDispositions();
  }, [campaignId]);

  async function loadDispositions() {
    setLoading(true);
    try {
      const data = await api.get<Disposition[]>(
        `/campaigns/${campaignId}/dispositions`
      );
      setDispositions(data);
    } catch {
      // handled by api client
    } finally {
      setLoading(false);
    }
  }

  async function createDisposition(e: React.FormEvent) {
    e.preventDefault();
    if (!newDispo.code || !newDispo.label) return;

    setSaving(true);
    try {
      await api.post(`/campaigns/${campaignId}/dispositions`, newDispo);
      setDialogOpen(false);
      setNewDispo({
        code: '',
        label: '',
        category: 'neutral',
        color: '#3B82F6',
        triggersRetry: false,
        triggersCompletion: false,
        triggersDnc: false,
        triggersCallback: false
      });
      await loadDispositions();
      toast.success(t('dispositions.toasts.created'));
    } catch (err: any) {
      toast.error(err?.message || t('dispositions.toasts.createError'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteDisposition(id: string) {
    try {
      await api.delete(`/campaigns/${campaignId}/dispositions/${id}`);
      setDeleteTarget(null);
      await loadDispositions();
      toast.success(t('dispositions.toasts.removed'));
    } catch (err: any) {
      toast.error(err?.message || t('dispositions.toasts.removeError'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <CardTitle>{t('dispositions.title')}</CardTitle>
            <CardDescription>{t('dispositions.description')}</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            {canManage && (
              <DialogTrigger asChild>
                <Button size='sm'>
                  <Plus className='mr-2 h-4 w-4' />
                  {t('dispositions.add')}
                </Button>
              </DialogTrigger>
            )}
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('dispositions.createTitle')}</DialogTitle>
                <DialogDescription>
                  {t('dispositions.createDescription')}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createDisposition} className='space-y-4'>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label htmlFor='dispo-code'>{t('dispositions.code')}</Label>
                    <Input
                      id='dispo-code'
                      placeholder={t('dispositions.codePlaceholder')}
                      value={newDispo.code}
                      onChange={(e) =>
                        setNewDispo({ ...newDispo, code: e.target.value })
                      }
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='dispo-label'>
                      {t('dispositions.label')}
                    </Label>
                    <Input
                      id='dispo-label'
                      placeholder={t('dispositions.labelPlaceholder')}
                      value={newDispo.label}
                      onChange={(e) =>
                        setNewDispo({ ...newDispo, label: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label>{t('dispositions.category')}</Label>
                    <Select
                      value={newDispo.category}
                      onValueChange={(v) =>
                        setNewDispo({
                          ...newDispo,
                          category: v as DispositionCategory
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='positive'>
                          {t('dispositions.categories.positive')}
                        </SelectItem>
                        <SelectItem value='neutral'>
                          {t('dispositions.categories.neutral')}
                        </SelectItem>
                        <SelectItem value='negative'>
                          {t('dispositions.categories.negative')}
                        </SelectItem>
                        <SelectItem value='no_contact'>
                          {t('dispositions.categories.no_contact')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='dispo-color'>
                      {t('dispositions.color')}
                    </Label>
                    <Input
                      id='dispo-color'
                      type='color'
                      value={newDispo.color}
                      onChange={(e) =>
                        setNewDispo({ ...newDispo, color: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className='space-y-3'>
                  <Label>{t('dispositions.triggers.title')}</Label>
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={newDispo.triggersCompletion}
                        onCheckedChange={(v) =>
                          setNewDispo({
                            ...newDispo,
                            triggersCompletion: !!v
                          })
                        }
                      />
                      {t('dispositions.triggers.completion')}
                    </label>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={newDispo.triggersRetry}
                        onCheckedChange={(v) =>
                          setNewDispo({ ...newDispo, triggersRetry: !!v })
                        }
                      />
                      {t('dispositions.triggers.retry')}
                    </label>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={newDispo.triggersCallback}
                        onCheckedChange={(v) =>
                          setNewDispo({ ...newDispo, triggersCallback: !!v })
                        }
                      />
                      {t('dispositions.triggers.callback')}
                    </label>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={newDispo.triggersDnc}
                        onCheckedChange={(v) =>
                          setNewDispo({ ...newDispo, triggersDnc: !!v })
                        }
                      />
                      {t('dispositions.triggers.dnc')}
                    </label>
                  </div>
                </div>
                <div className='flex justify-end gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setDialogOpen(false)}
                  >
                    {t('dispositions.cancel')}
                  </Button>
                  <Button type='submit' disabled={saving}>
                    {saving && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    {t('dispositions.create')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        ) : dispositions.length === 0 ? (
          <div className='flex flex-col items-center py-12 text-center'>
            <h3 className='text-lg font-semibold'>
              {t('dispositions.empty.title')}
            </h3>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('dispositions.empty.description')}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dispositions.table.code')}</TableHead>
                <TableHead>{t('dispositions.table.label')}</TableHead>
                <TableHead>{t('dispositions.table.category')}</TableHead>
                <TableHead className='hidden md:table-cell'>
                  {t('dispositions.table.triggers')}
                </TableHead>
                <TableActionHead>
                  <span className='sr-only'>{tCommon('actions')}</span>
                </TableActionHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dispositions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className='font-mono text-sm'>{d.code}</TableCell>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      {d.color && (
                        <div
                          className='h-3 w-3 rounded-full'
                          style={{ backgroundColor: d.color }}
                        />
                      )}
                      {d.label}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant='secondary'
                      className={CATEGORY_COLORS[d.category]}
                    >
                      {t(`dispositions.categories.${d.category}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className='hidden md:table-cell'>
                    <div className='flex flex-wrap gap-1'>
                      {d.triggersCompletion && (
                        <Badge variant='outline' className='text-xs'>
                          {t('dispositions.triggers.badges.completion')}
                        </Badge>
                      )}
                      {d.triggersRetry && (
                        <Badge variant='outline' className='text-xs'>
                          {t('dispositions.triggers.badges.retry')}
                        </Badge>
                      )}
                      {d.triggersCallback && (
                        <Badge variant='outline' className='text-xs'>
                          {t('dispositions.triggers.badges.callback')}
                        </Badge>
                      )}
                      {d.triggersDnc && (
                        <Badge variant='outline' className='text-xs'>
                          {t('dispositions.triggers.badges.dnc')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableActionCell>
                    {canManage && !d.isSystem && (
                      <TableRowActions
                        label={tCommon('openActions')}
                        menuLabel={tCommon('actions')}
                      >
                        <DropdownMenuItem
                          variant='destructive'
                          onClick={() => setDeleteTarget(d)}
                        >
                          <Trash2 className='h-4 w-4' />
                          {tCommon('delete')}
                        </DropdownMenuItem>
                      </TableRowActions>
                    )}
                  </TableActionCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon('areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tCommon('cannotBeUndone')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void deleteDisposition(deleteTarget.id);
              }}
            >
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
