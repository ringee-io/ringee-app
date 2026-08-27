'use client';

import { useEffect, useState } from 'react';
import { PhoneOff, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  useDialerAttemptStore,
  type DispositionOption
} from '../store/dialer-attempt.store';
import { useDisposeLead } from '../hooks/use-dispose-lead';
import { DispositionGrid } from './disposition-grid';

interface Props {
  /** Hangs up the live WebRTC leg. */
  onHangup: () => void | Promise<void>;
}

/**
 * Outcome buttons that appear over the workspace as soon as the call is
 * answered, so wrapping up is one click instead of "hang up, wait for the
 * panel, pick, submit".
 *
 * Clicking an outcome ends the call and saves it in the same gesture. The one
 * exception is a callback, which cannot be saved without a date — that click
 * still hangs up, and hands the choice to the wrap-up panel with the outcome
 * already selected so it is not lost.
 *
 * Dismissable, and it never covers the hang-up control: an agent who wants to
 * stay on the line after the buyer says goodbye must not have to fight a
 * popup.
 */
export function LiveDispositionPopup({ onHangup }: Props) {
  const t = useTranslations('dialer.disposition');
  const attemptId = useDialerAttemptStore((s) => s.attemptId);
  const callStatus = useDialerAttemptStore((s) => s.callStatus);
  const dispositions = useDialerAttemptStore((s) => s.availableDispositions);
  const setPreselectedDisposition = useDialerAttemptStore(
    (s) => s.setPreselectedDisposition
  );
  const { dispose, submitting } = useDisposeLead();
  const [dismissed, setDismissed] = useState(false);

  const answered = callStatus === 'answered' || callStatus === 'in_call';

  // Every new attempt gets the popup back, however the last one was dismissed.
  useEffect(() => {
    setDismissed(false);
  }, [attemptId]);

  if (!answered || dismissed || !attemptId || dispositions.length === 0) {
    return null;
  }

  async function handlePick(disposition: DispositionOption) {
    await onHangup();

    if (disposition.triggersCallback) {
      // Needs a date. Carry the choice into the wrap-up form instead of
      // saving a callback disposition that schedules nothing.
      setPreselectedDisposition(disposition.code);
      return;
    }

    await dispose({ dispositionCode: disposition.code });
  }

  return (
    <div className='pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:justify-end sm:p-0'>
      <div className='bg-card pointer-events-auto w-full max-w-sm rounded-lg border shadow-lg'>
        <div className='flex items-start justify-between gap-2 border-b px-4 py-3'>
          <div className='flex items-center gap-2'>
            <PhoneOff className='text-destructive h-4 w-4 shrink-0' />
            <div>
              <p className='text-sm font-semibold'>{t('liveTitle')}</p>
              <p className='text-muted-foreground text-xs'>
                {t('liveDescription')}
              </p>
            </div>
          </div>
          <Button
            variant='ghost'
            size='icon'
            className='h-6 w-6 shrink-0'
            onClick={() => setDismissed(true)}
            title={t('liveDismiss')}
          >
            <X className='h-3.5 w-3.5' />
          </Button>
        </div>

        <div className='p-3'>
          <DispositionGrid
            dispositions={dispositions}
            disabled={submitting}
            onSelect={handlePick}
          />
        </div>
      </div>
    </div>
  );
}
