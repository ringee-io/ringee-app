'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Avatar,
  AvatarFallback
} from '@ringee/frontend-shared/components/ui/avatar';
import { useTelnyxStore } from '@/features/calls/store/telnyx.store';
import { useAuth } from '@clerk/nextjs';
import { Loader2, Phone, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { setOutboundRingbackVolume } from '@ringee/dialer-core/engine';

type DialerState = 'ready' | 'connecting' | 'active' | 'ended' | 'error';

export function AttioDialer() {
  const searchParams = useSearchParams();
  const toNumber = searchParams.get('to');
  const fromNumber = searchParams.get('from');
  const contactName = searchParams.get('name');

  const { client, status: telnyxStatus } = useTelnyxStore();
  const { userId, orgId } = useAuth();
  const [dialerState, setDialerState] = useState<DialerState>('ready');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dialedRef = useRef(false);

  const isTelnyxReady = telnyxStatus === 'registered';

  const handleDial = useCallback(async () => {
    if (!client || !toNumber || !fromNumber || !userId) {
      setErrorMsg('Missing call parameters or connection not ready.');
      setDialerState('error');
      return;
    }

    try {
      setDialerState('connecting');
      await client.newCall({
        callerNumber: fromNumber,
        destinationNumber: toNumber,
        audio: true,
        customHeaders: [
          { name: 'From', value: `sip:${fromNumber}@sip.telnyx.com` },
          {
            name: 'P-Asserted-Identity',
            value: `sip:${fromNumber}@sip.telnyx.com`
          },
          {
            name: 'P-Preferred-Identity',
            value: `sip:${fromNumber}@sip.telnyx.com`
          },
          { name: 'X-User-Id', value: userId },
          ...(orgId ? [{ name: 'X-Organization-Id', value: orgId }] : [])
        ],
        keepConnectionAliveOnSocketClose: true,
        debug: process.env.NODE_ENV === 'development'
      });
      setOutboundRingbackVolume();
      setDialerState('active');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to initiate call'
      );
      setDialerState('error');
    }
  }, [client, toNumber, fromNumber, userId, orgId]);

  useEffect(() => {
    if (isTelnyxReady && toNumber && fromNumber && !dialedRef.current) {
      dialedRef.current = true;
      handleDial();
    }
  }, [isTelnyxReady, toNumber, fromNumber, handleDial]);

  if (!toNumber || !fromNumber) {
    return (
      <div className='flex min-h-[60vh] items-center justify-center'>
        <div className='flex flex-col items-center gap-4 text-center'>
          <div className='bg-destructive/10 flex h-14 w-14 items-center justify-center rounded-full'>
            <AlertCircle className='text-destructive h-6 w-6' />
          </div>
          <div>
            <h2 className='text-lg font-semibold'>Invalid Call Link</h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              This link is missing required parameters. Please start a new call
              from Attio.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const displayName = contactName || toNumber;

  return (
    <div className='flex min-h-[60vh] items-center justify-center'>
      <div className='bg-card flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border p-8 shadow-lg'>
        {/* Avatar */}
        <Avatar className='border-background h-20 w-20 border-4 shadow-xl'>
          <AvatarFallback className='bg-violet-500/10 text-2xl font-light text-violet-500'>
            {displayName.replace('+', '').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Contact info */}
        <div className='flex flex-col items-center gap-1 text-center'>
          <h2 className='text-xl font-bold'>{displayName}</h2>
          {contactName && (
            <p className='text-muted-foreground font-mono text-sm'>
              {toNumber}
            </p>
          )}
          <Badge
            variant='outline'
            className='mt-1 border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-500'
          >
            via Attio
          </Badge>
        </div>

        {/* From number */}
        <div className='text-muted-foreground flex items-center gap-2 text-xs'>
          <span>Calling from</span>
          <span className='text-foreground font-mono font-medium'>
            {fromNumber}
          </span>
        </div>

        {/* Status & Action */}
        {dialerState === 'ready' && (
          <div className='flex w-full flex-col items-center gap-3'>
            {!isTelnyxReady ? (
              <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Connecting to voice service...
              </div>
            ) : (
              <Button
                size='lg'
                className='w-full gap-2 bg-emerald-600 hover:bg-emerald-700'
                onClick={handleDial}
              >
                <Phone className='h-4 w-4' />
                Start Call
              </Button>
            )}
          </div>
        )}

        {dialerState === 'connecting' && (
          <div className='flex flex-col items-center gap-2'>
            <Loader2 className='h-6 w-6 animate-spin text-emerald-500' />
            <p className='text-sm font-medium'>Connecting...</p>
          </div>
        )}

        {dialerState === 'active' && (
          <div className='flex flex-col items-center gap-2'>
            <div className='flex items-center gap-2'>
              <CheckCircle2 className='h-4 w-4 text-emerald-500' />
              <p className='text-sm font-medium text-emerald-500'>
                Call initiated
              </p>
            </div>
            <p className='text-muted-foreground text-xs'>
              Use the call controls in the popup to manage your call.
            </p>
          </div>
        )}

        {dialerState === 'error' && (
          <div className='flex w-full flex-col items-center gap-3'>
            <div className='text-destructive flex items-center gap-2 text-sm'>
              <AlertCircle className='h-4 w-4' />
              {errorMsg || 'Something went wrong'}
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                dialedRef.current = false;
                setDialerState('ready');
                setErrorMsg(null);
              }}
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
