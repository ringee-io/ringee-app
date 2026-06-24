'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { IconAlertTriangle, IconLoader2 } from '@tabler/icons-react';
import PhoneInput, {
  type Country,
  type Value as PhoneValue,
  isValidPhoneNumber
} from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { formatUsd } from './caller-id.format';
import type { CallerId } from './caller-id.types';

type Method = 'sms' | 'call';

export function AddCallerIdModal({
  open,
  onOpenChange,
  fee,
  balance,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fee: number;
  balance: number;
  onCreated: (callerId: CallerId) => void;
}) {
  const t = useTranslations('settings.numbers.callerIds');
  const api = useApi();

  const [phone, setPhone] = useState<PhoneValue | undefined>();
  const [country, setCountry] = useState<Country | undefined>();
  const [method, setMethod] = useState<Method>('sms');
  const [extension, setExtension] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canAfford = balance >= fee;
  const phoneValid = !!phone && isValidPhoneNumber(phone);

  const reset = () => {
    setPhone(undefined);
    setCountry(undefined);
    setMethod('sms');
    setExtension('');
  };

  const submit = async () => {
    if (!phone || !phoneValid) {
      toast.error(t('addModal.invalidPhone'));
      return;
    }
    setSubmitting(true);
    try {
      const callerId = await api.post<CallerId>('/telephony/caller-id', {
        phoneNumber: phone,
        method,
        isoCountry: country,
        extension: extension.trim() || undefined
      });
      toast.success(t('addModal.success'));
      reset();
      onOpenChange(false);
      onCreated(callerId);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      toast.error(
        status === 402
          ? t('insufficientCredits', { fee: formatUsd(fee) })
          : t('addModal.error')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('addModal.title')}</DialogTitle>
          <DialogDescription>{t('addModal.description')}</DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-1'>
          <div className='space-y-1.5'>
            <Label className='text-xs'>{t('addModal.phoneLabel')}</Label>
            <PhoneInput
              international
              value={phone}
              onChange={setPhone}
              onCountryChange={setCountry}
              className='border-input focus-within:ring-primary flex h-9 items-center rounded-md border bg-transparent px-3 text-sm focus-within:ring-2'
            />
          </div>

          <div className='space-y-1.5'>
            <Label className='text-xs'>{t('addModal.methodLabel')}</Label>
            <div className='grid grid-cols-2 gap-2'>
              {(['sms', 'call'] as Method[]).map((m) => (
                <button
                  key={m}
                  type='button'
                  onClick={() => setMethod(m)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm transition-colors',
                    method === m
                      ? 'border-primary bg-primary/5 text-foreground font-medium'
                      : 'border-input text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  {m === 'sms'
                    ? t('addModal.methodSms')
                    : t('addModal.methodCall')}
                </button>
              ))}
            </div>
          </div>

          {method === 'call' && (
            <div className='space-y-1.5'>
              <Label className='text-xs'>{t('addModal.extensionLabel')}</Label>
              <Input
                value={extension}
                placeholder={t('addModal.extensionPlaceholder')}
                onChange={(e) => setExtension(e.target.value)}
              />
            </div>
          )}

          <div
            className={cn(
              'rounded-md border px-3 py-2.5 text-xs',
              canAfford
                ? 'bg-muted/50 text-muted-foreground'
                : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-500'
            )}
          >
            {canAfford ? (
              t('addModal.feeLine', { fee: formatUsd(fee) })
            ) : (
              <span className='flex items-start gap-2'>
                <IconAlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                {t('insufficientCredits', { fee: formatUsd(fee) })}
              </span>
            )}
            <div className='mt-1 opacity-80'>
              {t('balanceLabel', { balance: formatUsd(balance) })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('deleteModal.cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !phoneValid || !canAfford}
          >
            {submitting && (
              <IconLoader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            {submitting ? t('addModal.submitting') : t('addModal.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
