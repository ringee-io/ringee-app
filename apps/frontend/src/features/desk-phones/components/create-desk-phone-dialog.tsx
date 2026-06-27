'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import type {
  AssignableNumber,
  CreateSipDevicePayload,
  CreatedSipDevice,
  SipDeviceType
} from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadNumbers: () => Promise<AssignableNumber[]>;
  onCreate: (payload: CreateSipDevicePayload) => Promise<CreatedSipDevice>;
  onCreated: (result: CreatedSipDevice) => void;
}

const DEVICE_TYPES: SipDeviceType[] = [
  'yealink',
  'grandstream',
  'cisco',
  'zoiper',
  'other'
];

const STEP_TITLES = [
  'Connect a desk phone',
  'Device details',
  'Select a number',
  'Review'
];

export function CreateDeskPhoneDialog({
  open,
  onOpenChange,
  loadNumbers,
  onCreate,
  onCreated
}: Props) {
  const [step, setStep] = useState(0);
  const [label, setLabel] = useState('');
  const [deviceType, setDeviceType] = useState<SipDeviceType | ''>('');
  const [allowInbound, setAllowInbound] = useState(true);
  const [allowOutbound, setAllowOutbound] = useState(true);
  const [numberId, setNumberId] = useState<string>('');
  const [numbers, setNumbers] = useState<AssignableNumber[]>([]);
  const [confirmMove, setConfirmMove] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset + load numbers each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setLabel('');
    setDeviceType('');
    setAllowInbound(true);
    setAllowOutbound(true);
    setNumberId('');
    setConfirmMove(false);
    void loadNumbers().then(setNumbers);
  }, [open, loadNumbers]);

  const selectedNumber = useMemo(
    () => numbers.find((n) => n.id === numberId) ?? null,
    [numbers, numberId]
  );

  // A strong confirmation is required only when moving a number that currently
  // rings in Ringee apps onto desk-phone-only inbound.
  const requiresMoveConfirm =
    allowInbound &&
    !!selectedNumber &&
    selectedNumber.inboundMode === 'ringee_default';

  const canProceedFromNumber =
    !allowInbound || (!!numberId && (!requiresMoveConfirm || confirmMove));

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await onCreate({
        label: label.trim(),
        deviceType: deviceType || undefined,
        allowInbound,
        allowOutbound,
        numberId: numberId || null
      });
      onCreated(result);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(
        err?.data?.message || err?.message || 'Failed to create desk phone'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Don't lose a half-filled wizard on an accidental outside click. */}
      <DialogContent
        className='sm:max-w-lg'
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{STEP_TITLES[step]}</DialogTitle>
          <DialogDescription>Step {step + 1} of 4</DialogDescription>
        </DialogHeader>

        {/* Screen 1 — intro */}
        {step === 0 && (
          <div className='space-y-4 text-sm'>
            <p className='text-muted-foreground'>
              Use a physical SIP phone or softphone with your Ringee number.
              Incoming calls can ring directly on the desk phone, and outbound
              calls can still use the same Ringee number from Web, Chrome
              Extension, Mobile, and the desk phone.
            </p>
            <Alert>
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                If you assign a number to this desk phone, inbound calls for
                that number will ring only on this desk phone. It will not ring
                on Ringee Web, Chrome Extension, or Mobile.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Screen 2 — details */}
        {step === 1 && (
          <div className='space-y-4'>
            <div className='space-y-1.5'>
              <Label htmlFor='dp-label'>Device name</Label>
              <Input
                id='dp-label'
                placeholder='Office Yealink'
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Device type (optional)</Label>
              <Select
                value={deviceType}
                onValueChange={(v) => setDeviceType(v as SipDeviceType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select a type' />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className='capitalize'>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex items-center justify-between rounded-md border p-3'>
              <div>
                <p className='text-sm font-medium'>Allow outbound calls</p>
                <p className='text-muted-foreground text-xs'>
                  Place calls from the desk phone (validated by Ringee).
                </p>
              </div>
              <Switch
                checked={allowOutbound}
                onCheckedChange={setAllowOutbound}
              />
            </div>
            <div className='flex items-center justify-between rounded-md border p-3'>
              <div>
                <p className='text-sm font-medium'>Allow inbound calls</p>
                <p className='text-muted-foreground text-xs'>
                  Ring the assigned number on this desk phone only.
                </p>
              </div>
              <Switch
                checked={allowInbound}
                onCheckedChange={setAllowInbound}
              />
            </div>
            <p className='text-muted-foreground text-xs'>
              The device is assigned to you. Team assignment can be changed
              later.
            </p>
          </div>
        )}

        {/* Screen 3 — number */}
        {step === 2 && (
          <div className='space-y-3'>
            {numbers.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                No purchased numbers available. You can create the device now
                and assign a number later.
              </p>
            ) : (
              <div className='space-y-1.5'>
                <Label>
                  {allowInbound ? 'Number (required)' : 'Caller ID number'}
                </Label>
                <Select value={numberId} onValueChange={setNumberId}>
                  <SelectTrigger>
                    <SelectValue placeholder='Select a number' />
                  </SelectTrigger>
                  <SelectContent>
                    {numbers.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.phoneNumber}
                        {n.inboundMode === 'desk_phone_only'
                          ? ` — desk phone: ${n.inboundDeviceLabel ?? 'assigned'}`
                          : ' — Ringee Web/Mobile'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedNumber && (
              <div className='text-muted-foreground space-y-1 text-xs'>
                <div>
                  Current inbound destination:{' '}
                  <span className='text-foreground'>
                    {selectedNumber.inboundMode === 'desk_phone_only'
                      ? `Desk phone (${selectedNumber.inboundDeviceLabel ?? 'assigned'})`
                      : 'Ringee Web/Mobile'}
                  </span>
                </div>
                <div>
                  Outbound availability:{' '}
                  <span className='text-foreground'>
                    Web, Chrome Extension, Mobile, Desk Phone
                  </span>
                </div>
              </div>
            )}

            {requiresMoveConfirm && (
              <Alert variant='destructive'>
                <AlertTitle>
                  This number currently receives calls in Ringee
                </AlertTitle>
                <AlertDescription>
                  Assigning it to this desk phone will move inbound calls to the
                  desk phone only.
                  <label className='mt-2 flex items-center gap-2 text-sm'>
                    <input
                      type='checkbox'
                      checked={confirmMove}
                      onChange={(e) => setConfirmMove(e.target.checked)}
                    />
                    I understand inbound for this number will ring only on the
                    desk phone.
                  </label>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Screen 4 — review */}
        {step === 3 && (
          <div className='space-y-2 text-sm'>
            <ReviewRow label='Device name' value={label || '—'} />
            <ReviewRow
              label='Device type'
              value={deviceType ? deviceType : '—'}
            />
            <ReviewRow
              label='Selected number'
              value={selectedNumber?.phoneNumber ?? 'None (assign later)'}
            />
            <ReviewRow
              label='Inbound behavior'
              value={allowInbound ? 'Desk phone only' : 'Disabled'}
            />
            <ReviewRow
              label='Outbound behavior'
              value={
                allowOutbound
                  ? 'Web, Chrome Extension, Mobile, and desk phone'
                  : 'Disabled'
              }
            />
            <ReviewRow
              label='Credit & DNC validation'
              value='Enabled for desk phone outbound'
            />
            <ReviewRow label='Park Outbound Calls' value='Enabled' />
          </div>
        )}

        <DialogFooter className='gap-2 sm:justify-between'>
          <Button
            type='button'
            variant='ghost'
            disabled={step === 0 || submitting}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {step < 3 ? (
            <Button
              type='button'
              disabled={
                (step === 1 && !label.trim()) ||
                (step === 2 && !canProceedFromNumber)
              }
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button type='button' disabled={submitting} onClick={submit}>
              {submitting ? 'Creating…' : 'Create desk phone credentials'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-center justify-between gap-3'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='text-right font-medium capitalize'>{value}</span>
    </div>
  );
}
