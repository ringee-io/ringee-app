'use client';

import 'react-phone-number-input/style.css';
import { useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Circle, Clock } from 'lucide-react';
import PhoneInput from 'react-phone-number-input';
import { useSearchParams } from 'next/navigation';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useDialerStore } from '@/features/calls/store/dialer.store';
import { DialPad } from './dialer.pad';
import { ContactSelector } from './contact.selector';
import { NumberSelector } from './number.selector';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useTelnyxStore } from '../store/telnyx.store';
import { useCall } from '../hooks/use.call';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';

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
  const { client, activeCall } = useTelnyxStore();
  const { handleCall } = useCall();
  const { number, setNumber } = useDialerStore();
  const { balance, freeCallTrial, status: balanceStatus } = useCreditStore();
  
  // Always call the hook unconditionally, then use useMock to override
  const orgRole = useOrgRole();
  const canAccessAdminFeatures = useMock ? true : orgRole.canAccessAdminFeatures;

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

  // Auto-close quick dialer when on /call?tab=dialer (main dialer page)
  const { setQuickDial, quickDial } = useDialerStore();
  const isDialerTab = searchParams.get('tab') === 'dialer' || !searchParams.get('tab');
  const isOnCallPage = typeof window !== 'undefined' && window.location.pathname === '/call';
  
  useEffect(() => {
    if (isOnCallPage && isDialerTab && quickDial) {
      setQuickDial(false);
    }
  }, [isOnCallPage, isDialerTab, quickDial, setQuickDial]);

  return (
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
                      🎉 Free trial call available
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      Limited to 1 minute — call ends automatically
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className='text-muted-foreground text-sm'>Balance</p>
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
          <NumberSelector useMock={useMock} />
          <Separator className='opacity-10' />
          <ContactSelector number={number} onSelectNumber={setNumber} useMock={useMock} />
          <Separator className='opacity-10' />
          <PhoneInput
            international
            defaultCountry='US'
            placeholder='Enter number'
            // @ts-ignore
            value={number}
            onChange={(v) => setNumber(v || '')}
            className='bg-background w-full rounded-md border-none text-center text-lg tracking-widest focus:outline-none'
          />
          <DialPad
            number={number}
            setNumber={setNumber}
            onDelete={() => setNumber(number.slice(0, -1))}
            onCall={async () => await handleCall(number)}
            isCalling={isCalling}
            showCreditPopover={canAccessAdminFeatures && !freeCallTrial && balance <= 0}
          />
        </CardContent>
      </Card>
    </div>
  );
}

