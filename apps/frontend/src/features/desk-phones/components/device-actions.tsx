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
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            onClick={() =>
              run(
                () => onCheckRegistration(device.id),
                'Registration refreshed',
                'Check failed'
              )
            }
          >
            Check registration
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setChangeOpen(true)}>
            Change number
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRegenOpen(true)}>
            Regenerate password
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              run(
                () => onSetEnabled(device.id, disabled),
                disabled ? 'Device enabled' : 'Device disabled',
                'Update failed'
              )
            }
          >
            {disabled ? 'Enable' : 'Disable'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className='text-destructive'
            onClick={() => {
              setReroute('ringee');
              setDeleteOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Regenerate password */}
      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate SIP password?</AlertDialogTitle>
            <AlertDialogDescription>
              The current password stops working immediately. You will need to
              update the phone with the new credentials.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const result = await onRegenerate(device.id);
                  onCredentials(result);
                } catch (err: any) {
                  toast.error(err?.message || 'Regenerate failed');
                }
              }}
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete + inbound reroute */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {device.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the SIP connection and credentials. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {device.assignedNumber && (
            <div className='space-y-1.5'>
              <Label>
                What should happen to inbound for{' '}
                {device.assignedNumber.phoneNumber}?
              </Label>
              <Select value={reroute} onValueChange={setReroute}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ringee'>
                    Move number back to Ringee Web/Mobile (recommended)
                  </SelectItem>
                  {otherDevices.map((d) => (
                    <SelectItem key={d.id} value={`device:${d.id}`}>
                      Assign to desk phone: {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
                  'Desk phone deleted',
                  'Delete failed'
                );
              }}
            >
              Delete
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
            <DialogTitle>Change number</DialogTitle>
            <DialogDescription>
              The new number becomes desk-phone-only for inbound. The previous
              number returns to Ringee Web/Mobile.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label>Number</Label>
              <Select value={numberId} onValueChange={setNumberId}>
                <SelectTrigger>
                  <SelectValue placeholder='Select a number' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>No number (clear)</SelectItem>
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
                Ring inbound on this phone
              </span>
              <Switch
                checked={allowInbound}
                onCheckedChange={setAllowInbound}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='ghost' onClick={() => setChangeOpen(false)}>
              Cancel
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
                  'Number updated',
                  'Update failed'
                );
                setChangeOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
