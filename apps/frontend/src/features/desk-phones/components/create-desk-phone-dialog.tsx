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
import { useTranslations } from 'next-intl';

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

export function CreateDeskPhoneDialog({
  open,
  onOpenChange,
  loadNumbers,
  onCreate,
  onCreated
}: Props) {
  const t = useTranslations('calls.deskPhones.create');
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
      toast.error(err?.data?.message || err?.message || t('failed'));
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
          <DialogTitle>{t(`steps.${step}`)}</DialogTitle>
          <DialogDescription>
            {t('stepCount', { step: step + 1 })}
          </DialogDescription>
        </DialogHeader>

        {/* Screen 1 — intro */}
        {step === 0 && (
          <div className='space-y-4 text-sm'>
            <p className='text-muted-foreground'>{t('intro')}</p>
            <Alert>
              <AlertTitle>{t('important')}</AlertTitle>
              <AlertDescription>{t('importantDescription')}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Screen 2 — details */}
        {step === 1 && (
          <div className='space-y-4'>
            <div className='space-y-1.5'>
              <Label htmlFor='dp-label'>{t('deviceName')}</Label>
              <Input
                id='dp-label'
                placeholder={t('deviceNamePlaceholder')}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>{t('deviceType')}</Label>
              <Select
                value={deviceType}
                onValueChange={(v) => setDeviceType(v as SipDeviceType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('deviceTypePlaceholder')} />
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
                <p className='text-sm font-medium'>{t('allowOutbound')}</p>
                <p className='text-muted-foreground text-xs'>
                  {t('allowOutboundHint')}
                </p>
              </div>
              <Switch
                checked={allowOutbound}
                onCheckedChange={setAllowOutbound}
              />
            </div>
            <div className='flex items-center justify-between rounded-md border p-3'>
              <div>
                <p className='text-sm font-medium'>{t('allowInbound')}</p>
                <p className='text-muted-foreground text-xs'>
                  {t('allowInboundHint')}
                </p>
              </div>
              <Switch
                checked={allowInbound}
                onCheckedChange={setAllowInbound}
              />
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('assignmentHint')}
            </p>
          </div>
        )}

        {/* Screen 3 — number */}
        {step === 2 && (
          <div className='space-y-3'>
            {numbers.length === 0 ? (
              <p className='text-muted-foreground text-sm'>{t('noNumbers')}</p>
            ) : (
              <div className='space-y-1.5'>
                <Label>
                  {allowInbound ? t('numberRequired') : t('callerIdNumber')}
                </Label>
                <Select value={numberId} onValueChange={setNumberId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('numberPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {numbers.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.phoneNumber}
                        {n.inboundMode === 'desk_phone_only'
                          ? t('numberDeskPhone', {
                              name: n.inboundDeviceLabel ?? t('assigned')
                            })
                          : t('numberRingee')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedNumber && (
              <div className='text-muted-foreground space-y-1 text-xs'>
                <div>
                  {t('currentInbound')}{' '}
                  <span className='text-foreground'>
                    {selectedNumber.inboundMode === 'desk_phone_only'
                      ? t('deskPhoneDestination', {
                          name:
                            selectedNumber.inboundDeviceLabel ?? t('assigned')
                        })
                      : t('ringeeDestination')}
                  </span>
                </div>
                <div>
                  {t('outboundAvailability')}{' '}
                  <span className='text-foreground'>
                    {t('allOutboundChannels')}
                  </span>
                </div>
              </div>
            )}

            {requiresMoveConfirm && (
              <Alert variant='destructive'>
                <AlertTitle>{t('moveWarning.title')}</AlertTitle>
                <AlertDescription>
                  {t('moveWarning.description')}
                  <label className='mt-2 flex items-center gap-2 text-sm'>
                    <input
                      type='checkbox'
                      checked={confirmMove}
                      onChange={(e) => setConfirmMove(e.target.checked)}
                    />
                    {t('moveWarning.confirm')}
                  </label>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Screen 4 — review */}
        {step === 3 && (
          <div className='space-y-2 text-sm'>
            <ReviewRow label={t('review.deviceName')} value={label || '—'} />
            <ReviewRow
              label={t('review.deviceType')}
              value={deviceType ? deviceType : '—'}
            />
            <ReviewRow
              label={t('review.selectedNumber')}
              value={selectedNumber?.phoneNumber ?? t('review.none')}
            />
            <ReviewRow
              label={t('review.inboundBehavior')}
              value={
                allowInbound ? t('review.deskPhoneOnly') : t('review.disabled')
              }
            />
            <ReviewRow
              label={t('review.outboundBehavior')}
              value={
                allowOutbound
                  ? t('review.outboundChannels')
                  : t('review.disabled')
              }
            />
            <ReviewRow
              label={t('review.validation')}
              value={t('review.validationEnabled')}
            />
            <ReviewRow
              label={t('review.parkCalls')}
              value={t('review.enabled')}
            />
          </div>
        )}

        <DialogFooter className='gap-2 sm:justify-between'>
          <Button
            type='button'
            variant='ghost'
            disabled={step === 0 || submitting}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            {t('back')}
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
              {t('continue')}
            </Button>
          ) : (
            <Button type='button' disabled={submitting} onClick={submit}>
              {submitting ? t('creating') : t('submit')}
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
