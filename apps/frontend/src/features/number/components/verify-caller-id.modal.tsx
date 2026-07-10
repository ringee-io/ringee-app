'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { IconLoader2 } from '@tabler/icons-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import type { CallerId } from './caller-id.types';

export function VerifyCallerIdModal({
  callerId,
  onOpenChange,
  onVerified
}: {
  /** The caller ID being verified, or null when the modal is closed. */
  callerId: CallerId | null;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
}) {
  const t = useTranslations('settings.numbers.callerIds');
  const api = useApi();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  // Reset the field whenever a different caller ID opens the modal.
  useEffect(() => {
    setCode('');
  }, [callerId?.id]);

  const submit = async (value: string) => {
    if (!callerId || value.length === 0) return;
    setSubmitting(true);
    try {
      await api.post(`/telephony/caller-id/${callerId.id}/verify`, {
        verificationCode: value
      });
      toast.success(t('verifyModal.success'));
      onOpenChange(false);
      onVerified();
    } catch {
      toast.error(t('verifyModal.error'));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (!callerId) return;
    setResending(true);
    try {
      await api.post('/telephony/caller-id', {
        phoneNumber: callerId.phoneNumber,
        method: callerId.verificationMethod === 'call' ? 'call' : 'sms',
        isoCountry: callerId.isoCountry
      });
      toast.success(t('verifyModal.resent'));
    } catch (err) {
      const status = (err as { status?: number })?.status;
      toast.error(status === 402 ? t('toggle.error') : t('addModal.error'));
    } finally {
      setResending(false);
    }
  };

  return (
    <Dialog
      open={!!callerId}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>
            {t('verifyModal.title', { phone: callerId?.phoneNumber ?? '' })}
          </DialogTitle>
          <DialogDescription>
            {t('verifyModal.description')}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col items-center gap-4 py-2'>
          <Input
            inputMode='numeric'
            autoComplete='one-time-code'
            autoFocus
            placeholder='••••••'
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, ''))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit(code);
            }}
            disabled={submitting}
            className='text-center text-lg tracking-[0.3em]'
          />

          <button
            type='button'
            onClick={resend}
            disabled={resending || submitting}
            className='text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline disabled:opacity-50'
          >
            {t('verifyModal.resend')}
          </button>
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
            onClick={() => submit(code)}
            disabled={submitting || code.length === 0}
          >
            {submitting && (
              <IconLoader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            {submitting ? t('verifyModal.submitting') : t('verifyModal.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
