'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import {
  IconInfoCircle,
  IconPlus,
  IconShieldCheck,
  IconTrash
} from '@tabler/icons-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
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
import { cn } from '@ringee/frontend-shared/lib/utils';
import { AddCallerIdModal } from './add-caller-id.modal';
import { VerifyCallerIdModal } from './verify-caller-id.modal';
import { formatUsd } from './caller-id.format';
import {
  type CallerId,
  type CallerIdStatus,
  resolveCallerIdStatus
} from './caller-id.types';

const STATUS_CLASS: Record<CallerIdStatus, string> = {
  verified:
    'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/20 dark:text-green-400',
  pending: 'bg-orange-500 text-white border-transparent',
  failed: 'bg-red-500 text-white border-transparent',
  inactive: 'bg-muted text-muted-foreground border-transparent'
};

export function CallerIdListing() {
  const t = useTranslations('settings.numbers.callerIds');
  const api = useApi();

  const [loading, setLoading] = useState(true);
  const [callerIds, setCallerIds] = useState<CallerId[]>([]);
  const [fee, setFee] = useState(1);
  const [balance, setBalance] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<CallerId | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CallerId | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, feeRes, balanceRes] = await Promise.all([
        api.get<CallerId[]>('/telephony/caller-ids'),
        api
          .get<{ fee: number }>('/telephony/caller-id/verification-fee')
          .catch(() => ({ fee: 1 })),
        api
          .get<{ balance: number }>('/credits/balance')
          .catch(() => ({ balance: 0 }))
      ]);
      setCallerIds(list);
      setFee(feeRes.fee);
      setBalance(balanceRes.balance);
    } catch {
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (callerId: CallerId, active: boolean) => {
    if (active && !callerId.verified) {
      toast.error(t('toggle.needsVerification'));
      return;
    }
    // Optimistic — revert on failure.
    setCallerIds((prev) =>
      prev.map((c) => (c.id === callerId.id ? { ...c, active } : c))
    );
    try {
      await api.patch(`/telephony/caller-id/${callerId.id}/active`, { active });
      toast.success(active ? t('toggle.activated') : t('toggle.deactivated'));
    } catch {
      setCallerIds((prev) =>
        prev.map((c) => (c.id === callerId.id ? { ...c, active: !active } : c))
      );
      toast.error(t('toggle.error'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/telephony/caller-id/${deleteTarget.id}`);
      toast.success(t('deleteModal.success'));
      setCallerIds((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error(t('deleteModal.error'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-1'>
          <h2 className='text-sm font-semibold tracking-tight'>{t('title')}</h2>
          <p className='text-muted-foreground max-w-2xl text-sm'>
            {t('description')}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className='shrink-0'>
          <IconPlus className='mr-2 h-4 w-4' />
          {t('add')}
        </Button>
      </div>

      <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
        <span className='flex items-center gap-1.5'>
          <IconInfoCircle className='h-3.5 w-3.5' />
          {t('feeNotice', { fee: formatUsd(fee) })}
        </span>
        <span>{t('surchargeNotice')}</span>
      </div>

      {loading ? (
        <div className='space-y-2'>
          <Skeleton className='h-12 w-full' />
          <Skeleton className='h-12 w-full' />
          <Skeleton className='h-12 w-full' />
        </div>
      ) : callerIds.length === 0 ? (
        <div className='bg-card flex flex-col items-center gap-3 rounded-xl border py-12 text-center'>
          <div className='bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full'>
            <IconShieldCheck className='h-6 w-6' />
          </div>
          <p className='text-muted-foreground max-w-sm text-sm'>{t('empty')}</p>
          <Button variant='outline' onClick={() => setAddOpen(true)}>
            <IconPlus className='mr-2 h-4 w-4' />
            {t('add')}
          </Button>
        </div>
      ) : (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.phoneNumber')}</TableHead>
                <TableHead>{t('table.country')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead>{t('table.active')}</TableHead>
                <TableHead>{t('table.addedOn')}</TableHead>
                <TableHead className='text-right'>
                  {t('table.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {callerIds.map((callerId) => {
                const status = resolveCallerIdStatus(callerId);
                const needsVerify = status === 'pending' || status === 'failed';
                return (
                  <TableRow key={callerId.id}>
                    <TableCell className='font-medium'>
                      {callerId.phoneNumber}
                    </TableCell>
                    <TableCell className='text-muted-foreground uppercase'>
                      {callerId.isoCountry && callerId.isoCountry !== 'XX'
                        ? callerId.isoCountry
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant='outline'
                        className={cn('capitalize', STATUS_CLASS[status])}
                      >
                        {t(`status.${status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={callerId.active && callerId.verified}
                        disabled={!callerId.verified}
                        onCheckedChange={(checked) =>
                          toggleActive(callerId, checked)
                        }
                        aria-label={t('table.active')}
                      />
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {callerId.createdAt
                        ? format(new Date(callerId.createdAt), 'dd MMM yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center justify-end gap-2'>
                        {needsVerify && (
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => setVerifyTarget(callerId)}
                          >
                            <IconShieldCheck className='mr-1.5 h-4 w-4' />
                            {status === 'failed'
                              ? t('actions.verify')
                              : t('actions.enterCode')}
                          </Button>
                        )}
                        <Button
                          size='icon'
                          variant='ghost'
                          className='text-muted-foreground hover:text-red-600'
                          onClick={() => setDeleteTarget(callerId)}
                          aria-label={t('actions.delete')}
                        >
                          <IconTrash className='h-4 w-4' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AddCallerIdModal
        open={addOpen}
        onOpenChange={setAddOpen}
        fee={fee}
        balance={balance}
        onCreated={(created) => {
          void load();
          setVerifyTarget(created);
        }}
      />

      <VerifyCallerIdModal
        callerId={verifyTarget}
        onOpenChange={(open) => {
          if (!open) setVerifyTarget(null);
        }}
        onVerified={() => void load()}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteModal.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteModal.description', {
                phone: deleteTarget?.phoneNumber ?? ''
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('deleteModal.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className='bg-red-600 text-white hover:bg-red-700'
            >
              {t('deleteModal.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
