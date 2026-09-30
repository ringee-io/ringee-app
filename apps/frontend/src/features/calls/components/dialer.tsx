'use client';

import 'react-phone-number-input/style.css';
import { useEffect, useState } from 'react';
import {
  Card,
  CardHeader,
  CardContent
} from '@ringee/frontend-shared/components/ui/card';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Clock } from 'lucide-react';
import PhoneInput, { type Country } from 'react-phone-number-input';
import { useSearchParams } from 'next/navigation';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useDialerStore } from '@/features/calls/store/dialer.store';
import { DialPad } from './dialer.pad';
import { ContactSelector } from './contact.selector';
import { NumberSelector } from './number.selector';
import { LineStatusBadge } from './line-status-badge';
import { useCall } from '../hooks/use.call';
import { useDial } from '../hooks/use.dial';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { cn } from '@ringee/frontend-shared/lib/utils';
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

export function Dialer({
  full,
  useMock
}: {
  full?: boolean;
  useMock?: boolean;
}) {
  const searchParams = useSearchParams();
  const t = useTranslations('calls.dialer');
  const { handleCall } = useCall();
  const { dial, dialingNumber, onCall, lineStatus } = useDial();
  const { number, setNumber } = useDialerStore();
  const {
    balance,
    canCall,
    freeCallTrial,
    status: balanceStatus
  } = useCreditStore();
  const { canAccessAdminFeatures: isAdmin } = useOrgRole();
  // The mock dialer demos the admin view (balance, credit popover).
  const canAccessAdminFeatures = useMock || isAdmin;

  // Shared between the text field and the tap-to-dial keypad so both agree on
  // which country's calling code to use for bare, locally-dialed digits.
  const [country, setCountry] = useState<Country>('US');

  const phoneNumberSelected = searchParams.get('phoneNumber');

  useEffect(() => {
    if (phoneNumberSelected) setNumber(`+${phoneNumberSelected.trim()}`);
  }, [phoneNumberSelected, setNumber]);

  const showCreditPopover =
    canCall && canAccessAdminFeatures && !freeCallTrial && balance <= 0;

  // Mock mode has no backend: no DNC check, no pre-flight guards.
  async function call() {
    if (!number) return;
    if (useMock) {
      await handleCall(number);
      return;
    }
    // Out of credit, the keypad's button opens the credit popover instead of
    // calling this; Enter still lands here and `dial` explains the refusal.
    await dial(number);
  }

  return (
    <div
      className={cn({
        'grid grid-cols-1 md:grid-cols-3': !full,
        'w-full': full
      })}
    >
      <Card className='@container/card'>
        <CardHeader className='flex items-center justify-between gap-2 pb-3'>
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
          <LineStatusBadge status={useMock ? 'registered' : lineStatus} />
        </CardHeader>

        <CardContent className='space-y-3'>
          {!canCall && balanceStatus === 'success' && (
            <p className='rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400'>
              {t('outboundDisabled')}
            </p>
          )}
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
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              void call();
            }}
            aria-label={t('enterNumber')}
            className='bg-background w-full rounded-md border-none text-center text-lg tracking-widest focus:outline-none'
          />
          <p className='text-muted-foreground text-center text-xs'>
            {t('enterToCall')}
          </p>
          <DialPad
            number={number}
            setNumber={setNumber}
            onDelete={() => setNumber(number.slice(0, -1))}
            onCall={call}
            isCalling={!useMock && dialingNumber !== null}
            callingDisabled={!useMock && !canCall}
            disabledReason={!useMock && onCall ? t('alreadyOnCall') : undefined}
            country={country}
            showCreditPopover={showCreditPopover}
          />
          <Separator className='opacity-10' />
          <NumberSelector useMock={useMock} />
        </CardContent>
      </Card>
    </div>
  );
}
