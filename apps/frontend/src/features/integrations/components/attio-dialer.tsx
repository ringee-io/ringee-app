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
import { useCallback, useRef, useState } from 'react';
import { placeCall } from '@ringee/dialer-core';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useTranslations } from 'next-intl';

type DialerState = 'ready' | 'connecting' | 'active' | 'ended' | 'error';

interface ContactSalesProfile {
  company?: string | null;
  jobTitle?: string | null;
  locationRegion?: string | null;
  websiteUrl?: string | null;
  revenue?: string | null;
  companySize?: string | null;
}

export function AttioDialer() {
  const api = useApi();
  const t = useTranslations('integrations.attio.dialer');
  const searchParams = useSearchParams();
  const toNumber = searchParams.get('to');
  const fromNumber = searchParams.get('from');
  const contactName = searchParams.get('name');

  const { client, status: telnyxStatus } = useTelnyxStore();
  const { userId, orgId } = useAuth();
  const [dialerState, setDialerState] = useState<DialerState>('ready');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [contactProfile, setContactProfile] =
    useState<ContactSalesProfile | null>(null);

  const dialing = useRef(false);
  const isTelnyxReady = telnyxStatus === 'registered';

  // Nothing happens on opening the link: the number in it is whatever the
  // link says, so placing the call (and saving its contact) waits for the
  // person to press "Start call".
  const handleDial = useCallback(async () => {
    if (!client || !toNumber || !fromNumber || !userId) {
      setErrorMsg(t('errors.missingParams'));
      setDialerState('error');
      return;
    }

    if (dialing.current) return;
    dialing.current = true;

    api
      .post<ContactSalesProfile>('/contacts/find-or-create', {
        phoneNumber: toNumber
      })
      .then(setContactProfile)
      .catch(() => setContactProfile(null));

    try {
      setDialerState('connecting');
      const prepared = await api.post<{
        phoneNumber: string | null;
        dialToken?: string;
      }>('/caller-id-rotation/resolve', {
        destination: toNumber,
        fallbackPhoneNumber: fromNumber
      });
      if (!prepared.phoneNumber || !prepared.dialToken) {
        throw new Error(t('errors.initiateFailed'));
      }
      placeCall({
        client,
        callerId: prepared.phoneNumber,
        destination: toNumber,
        userId,
        organizationId: orgId ?? undefined,
        dialToken: prepared.dialToken,
        debug: process.env.NODE_ENV === 'development'
      });
      setDialerState('active');
    } catch (err) {
      await api.post('/caller-id-rotation/abandon', {}).catch(() => undefined);
      setErrorMsg(
        err instanceof Error ? err.message : t('errors.initiateFailed')
      );
      setDialerState('error');
    } finally {
      dialing.current = false;
    }
  }, [api, client, toNumber, fromNumber, userId, orgId, t]);

  if (!toNumber || !fromNumber) {
    return (
      <div className='flex min-h-[60vh] items-center justify-center'>
        <div className='flex flex-col items-center gap-4 text-center'>
          <div className='bg-destructive/10 flex h-14 w-14 items-center justify-center rounded-full'>
            <AlertCircle className='text-destructive h-6 w-6' />
          </div>
          <div>
            <h2 className='text-lg font-semibold'>{t('invalidLink.title')}</h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('invalidLink.description')}
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
          {contactProfile &&
            [contactProfile.jobTitle, contactProfile.company].some(Boolean) && (
              <p className='text-muted-foreground max-w-full truncate text-xs'>
                {[contactProfile.jobTitle, contactProfile.company]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          {contactProfile &&
            [
              contactProfile.locationRegion,
              contactProfile.websiteUrl,
              contactProfile.revenue,
              contactProfile.companySize
            ].some(Boolean) && (
              <p className='text-muted-foreground max-w-full truncate text-xs'>
                {[
                  contactProfile.locationRegion,
                  contactProfile.websiteUrl,
                  contactProfile.revenue,
                  contactProfile.companySize
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          <Badge
            variant='outline'
            className='mt-1 border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-500'
          >
            {t('viaAttio')}
          </Badge>
        </div>

        {/* From number */}
        <div className='text-muted-foreground flex items-center gap-2 text-xs'>
          <span>{t('callingFrom')}</span>
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
                {t('connectingToVoice')}
              </div>
            ) : (
              <Button
                size='lg'
                className='w-full gap-2 bg-emerald-600 hover:bg-emerald-700'
                onClick={handleDial}
              >
                <Phone className='h-4 w-4' />
                {t('startCall')}
              </Button>
            )}
          </div>
        )}

        {dialerState === 'connecting' && (
          <div className='flex flex-col items-center gap-2'>
            <Loader2 className='h-6 w-6 animate-spin text-emerald-500' />
            <p className='text-sm font-medium'>{t('connecting')}</p>
          </div>
        )}

        {dialerState === 'active' && (
          <div className='flex flex-col items-center gap-2'>
            <div className='flex items-center gap-2'>
              <CheckCircle2 className='h-4 w-4 text-emerald-500' />
              <p className='text-sm font-medium text-emerald-500'>
                {t('callInitiated')}
              </p>
            </div>
            <p className='text-muted-foreground text-xs'>{t('callHint')}</p>
          </div>
        )}

        {dialerState === 'error' && (
          <div className='flex w-full flex-col items-center gap-3'>
            <div className='text-destructive flex items-center gap-2 text-sm'>
              <AlertCircle className='h-4 w-4' />
              {errorMsg || t('errors.somethingWrong')}
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                setDialerState('ready');
                setErrorMsg(null);
              }}
            >
              {t('tryAgain')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
