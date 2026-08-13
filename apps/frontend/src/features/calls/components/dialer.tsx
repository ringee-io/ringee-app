'use client';

import 'react-phone-number-input/style.css';
import { useEffect, useState } from 'react';
import {
  Card,
  CardHeader,
  CardContent
} from '@ringee/frontend-shared/components/ui/card';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Circle, Clock } from 'lucide-react';
import PhoneInput, { type Country } from 'react-phone-number-input';
import { useSearchParams } from 'next/navigation';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useDialerStore } from '@/features/calls/store/dialer.store';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { DialPad } from './dialer.pad';
import { ContactSelector } from './contact.selector';
import { NumberSelector } from './number.selector';
import { DncWarningModal } from './dnc-warning-modal';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useTelnyxStore } from '../store/telnyx.store';
import { useCall } from '../hooks/use.call';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useTranslations } from 'next-intl';

export enum CallStatus {
  idle = 'idle',
  pending = 'pending',
  ringing = 'ringing',
  answered = 'answered',
  recording = 'recording',
  completed = 'completed',
  failed = 'failed'
}

interface DncCheckResponse {
  phoneNumber: string;
  isOnDNC: boolean;
  reason: string | null;
  source: string | null;
  addedAt: string | null;
}

interface PendingDncDialog {
  phoneNumber: string;
  reason: string | null;
  addedAt: string | null;
}

export function Dialer({
  full,
  useMock
}: {
  full?: boolean;
  useMock?: boolean;
}) {
  const searchParams = useSearchParams();
  const t = useTranslations('calls.dialer');
  const { client, activeCall } = useTelnyxStore();
  const { handleCall } = useCall();
  const { number, setNumber } = useDialerStore();
  const {
    balance,
    canCall,
    freeCallTrial,
    status: balanceStatus
  } = useCreditStore();
  const { canAccessAdminFeatures } = useMock
    ? { canAccessAdminFeatures: true }
    : useOrgRole();
  const api = useApi();

  const [dncDialog, setDncDialog] = useState<PendingDncDialog | null>(null);
  const [checkingDnc, setCheckingDnc] = useState(false);
  // Shared between the text field and the tap-to-dial keypad so both agree on
  // which country's calling code to use for bare, locally-dialed digits.
  const [country, setCountry] = useState<Country>('US');

  const phoneNumberSelected = searchParams.get('phoneNumber');
  const status = activeCall?.state || CallStatus.idle;
  const isCalling =
    status === CallStatus.pending ||
    status === CallStatus.ringing ||
    status === CallStatus.answered ||
    status === CallStatus.recording;

  useEffect(() => {
    if (phoneNumberSelected) setNumber(`+${phoneNumberSelected.trim()}`);
  }, [phoneNumberSelected]);

  // Mock mode bypasses the DNC check — no backend available.
  async function attemptCall(targetNumber: string) {
    if (!targetNumber) return;

    if (useMock) {
      await handleCall(targetNumber);
      return;
    }

    setCheckingDnc(true);
    try {
      const res = await api.get<DncCheckResponse>(
        `/dnc/check/${encodeURIComponent(targetNumber)}`
      );
      if (res?.isOnDNC) {
        setDncDialog({
          phoneNumber: targetNumber,
          reason: res.reason,
          addedAt: res.addedAt
        });
        return;
      }
    } catch (err) {
      // DNC check is best-effort: a 4xx/5xx must NOT block legitimate calls.
      // Compliance is a backstop, not a single point of failure.
      console.warn('DNC check failed, proceeding with call', err);
    } finally {
      setCheckingDnc(false);
    }

    await handleCall(targetNumber);
  }

  return (
    <>
      <div
        className={cn('', {
          'cursor-not-allowed opacity-50': !useMock && !client?.connected,
          'grid grid-cols-1 md:grid-cols-3': !full,
          'w-full': full
        })}
      >
        <Card className='@container/card'>
          <CardHeader className='flex items-center justify-between pb-3'>
            {canAccessAdminFeatures && balanceStatus === 'success' ? (
              <div className='flex items-center gap-2'>
                {freeCallTrial ? (
                  <div className='flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2'>
                    <Clock className='h-4 w-4 shrink-0 text-amber-500' />
                    <div>
                      <p className='text-sm font-semibold text-amber-600 dark:text-amber-400'>
                        {t('freeTrial')}
                      </p>
                      <p className='text-muted-foreground text-xs'>
                        {t('freeTrialHint')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className='text-muted-foreground text-sm'>
                      {t('balance')}
                    </p>
                    <p className='text-base font-semibold'>
                      ${balance.toFixed(2)}
                    </p>
                  </>
                )}
              </div>
            ) : canAccessAdminFeatures ? (
              <Skeleton className='h-4 w-42' />
            ) : (
              <div />
            )}
            <Circle className={`h-3 w-3`} />
          </CardHeader>

          <CardContent className='space-y-3'>
            {!canCall && balanceStatus === 'success' && (
              <p className='rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400'>
                {t('outboundDisabled')}
              </p>
            )}
            <NumberSelector useMock={useMock} />
            <Separator className='opacity-10' />
            <ContactSelector number={number} onSelectNumber={setNumber} />
            <Separator className='opacity-10' />
            <PhoneInput
              international
              defaultCountry='US'
              country={country}
              onCountryChange={(c) => c && setCountry(c)}
              placeholder={t('enterNumber')}
              // @ts-ignore
              value={number}
              onChange={(v) => setNumber(v || '')}
              className='bg-background w-full rounded-md border-none text-center text-lg tracking-widest focus:outline-none'
            />
            <DialPad
              number={number}
              setNumber={setNumber}
              onDelete={() => setNumber(number.slice(0, -1))}
              onCall={async () => await attemptCall(number)}
              isCalling={isCalling || checkingDnc}
              callingDisabled={!useMock && !canCall}
              country={country}
              showCreditPopover={
                canCall &&
                canAccessAdminFeatures &&
                !freeCallTrial &&
                balance <= 0
              }
            />
          </CardContent>
        </Card>
      </div>

      <DncWarningModal
        open={dncDialog !== null}
        phoneNumber={dncDialog?.phoneNumber ?? null}
        reason={dncDialog?.reason}
        addedAt={dncDialog?.addedAt}
        onCancel={() => setDncDialog(null)}
        onCallAnyway={async () => {
          const target = dncDialog?.phoneNumber;
          setDncDialog(null);
          if (target) await handleCall(target);
        }}
      />
    </>
  );
}
