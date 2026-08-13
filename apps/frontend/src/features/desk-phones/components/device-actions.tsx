'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import type {
  AssignableNumber,
  CreatedSipDevice,
  InboundReroute,
  SipDevice
} from '../types';
import { useTranslations } from 'next-intl';

interface Props {
  device: SipDevice;
  otherDevices: SipDevice[];
  loadNumbers: () => Promise<AssignableNumber[]>;
  onCheckRegistration: (id: string) => Promise<unknown>;
  onRegenerate: (id: string) => Promise<CreatedSipDevice>;
  onSetEnabled: (id: string, enabled: boolean) => Promise<unknown>;
  onChangeNumber: (
    id: string,
    numberId: string | null,
    allowInbound?: boolean
  ) => Promise<unknown>;
  onRemove: (
    id: string,
    reroute: InboundReroute,
    targetDeviceId?: string | null
  ) => Promise<unknown>;
  onCredentials: (result: CreatedSipDevice) => void;
}

export function DeviceActions({
  device,
  otherDevices,
  loadNumbers,
  onCheckRegistration,
  onRegenerate,
  onSetEnabled,
  onChangeNumber,
  onRemove,
  onCredentials
}: Props) {
  const t = useTranslations('calls.deskPhones.actions');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const disabled = device.status === 'disabled';

  // Delete reroute state.
  const [reroute, setReroute] = useState<string>('ringee');

  // Change-number state.
  const [numbers, setNumbers] = useState<AssignableNumber[]>([]);
  const [numberId, setNumberId] = useState<string>(
    device.assignedNumber?.id ?? 'none'
  );
  const [allowInbound, setAllowInbound] = useState(device.allowInbound);
  useEffect(() => {
    if (changeOpen) void loadNumbers().then(setNumbers);
  }, [changeOpen, loadNumbers]);

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || fail);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='sm'>
            {t('menu')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            onClick={() =>
              run(
                () => onCheckRegistration(device.id),
                t('toasts.registrationRefreshed'),
                t('toasts.checkFailed')
              )
            }
          >
            {t('checkRegistration')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setChangeOpen(true)}>
            {t('changeNumber')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRegenOpen(true)}>
            {t('regeneratePassword')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              run(
                () => onSetEnabled(device.id, disabled),
                disabled ? t('toasts.enabled') : t('toasts.disabled'),
                t('toasts.updateFailed')
              )
            }
          >
            {disabled ? t('enable') : t('disable')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className='text-destructive'
            onClick={() => {
              setReroute('ringee');
              setDeleteOpen(true);
            }}
          >
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Regenerate password */}
      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('regenerate.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('regenerate.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const result = await onRegenerate(device.id);
                  onCredentials(result);
                } catch (err: any) {
                  toast.error(err?.message || t('toasts.regenerateFailed'));
                }
              }}
            >
              {t('regenerate.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete + inbound reroute */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('remove.title', { name: device.label })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('remove.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {device.assignedNumber && (
            <div className='space-y-1.5'>
              <Label>
                {t('remove.rerouteLabel', {
                  number: device.assignedNumber.phoneNumber
                })}
              </Label>
              <Select value={reroute} onValueChange={setReroute}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ringee'>
                    {t('remove.ringeeOption')}
                  </SelectItem>
                  {otherDevices.map((d) => (
                    <SelectItem key={d.id} value={`device:${d.id}`}>
                      {t('remove.deviceOption', { name: d.label })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive hover:bg-destructive/90 text-white'
              onClick={async () => {
                const isDevice = reroute.startsWith('device:');
                await run(
                  () =>
                    onRemove(
                      device.id,
                      isDevice ? 'device' : 'ringee',
                      isDevice ? reroute.slice('device:'.length) : null
                    ),
                  t('toasts.deleted'),
                  t('toasts.deleteFailed')
                );
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change number */}
      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent
          className='sm:max-w-md'
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('change.title')}</DialogTitle>
            <DialogDescription>{t('change.description')}</DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label>{t('change.number')}</Label>
              <Select value={numberId} onValueChange={setNumberId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('change.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>{t('change.none')}</SelectItem>
                  {numbers.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.phoneNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex items-center justify-between rounded-md border p-3'>
              <span className='text-sm font-medium'>
                {t('change.ringInbound')}
              </span>
              <Switch
                checked={allowInbound}
                onCheckedChange={setAllowInbound}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='ghost' onClick={() => setChangeOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={async () => {
                await run(
                  () =>
                    onChangeNumber(
                      device.id,
                      numberId === 'none' ? null : numberId,
                      allowInbound
                    ),
                  t('toasts.numberUpdated'),
                  t('toasts.updateFailed')
                );
                setChangeOpen(false);
              }}
            >
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
