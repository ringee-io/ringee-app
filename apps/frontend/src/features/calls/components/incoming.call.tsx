'use client';

import {
  Avatar,
  AvatarFallback
} from '@ringee/frontend-shared/components/ui/avatar';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, PhoneOff, Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Call } from '@telnyx/webrtc';
import { useTranslations } from 'next-intl';
import { ApiError, type ApiClient } from '@ringee/frontend-shared/lib/api';
import { useCallStore } from '../store/call.store';
import { useTelnyxStore } from '../store/telnyx.store';
import {
  releaseInboundOffer,
  useInboundOffer
} from '../store/inbound-offers.store';
import { getInitials } from './dialer-side-panel/shared';

/**
 * Rendered by the root `<Toaster />`, which sits outside `ClerkProvider`: a
 * Clerk hook here (`useApi`) throws and takes the whole dashboard down. The
 * dashboard builds the client and hands it in.
 */
export function IncomingCall({
  call,
  api,
  onClose
}: {
  call: Call;
  api: ApiClient;
  onClose: () => void;
}) {
  const t = useTranslations('calls');
  const setActiveCall = useTelnyxStore((s) => s.setActiveCall);
  const activeCall = useTelnyxStore((s) => s.activeCall);
  const dequeue = useTelnyxStore((s) => s.dequeue);
  /**
   * The previous call's wrap-up is still open. A call answered behind it has
   * no controls on screen, and closing the wrap-up takes the active call off
   * the screen — so this one can be answered once the wrap-up is done.
   */
  const wrappingUp = useCallStore((s) => s.postCallPhase);
  /** What the server said about this leg — absent on the legacy fallback path. */
  const offer = useInboundOffer(call.id);
  const [answering, setAnswering] = useState(false);

  /** The caller as the workspace has them saved — absent for a stranger. */
  const contact = offer?.contact ?? null;
  // An inbound leg's own `callerNumber`/`callerName` are the side that was
  // called; the person calling is its remote party.
  const callerNumber =
    offer?.fromNumber ?? call.options?.remoteCallerNumber ?? '';
  const callerName =
    contact?.name ||
    offer?.callerName ||
    call.options?.remoteCallerName ||
    null;

  const isCurrentCallActive = activeCall?.id === call?.id;

  /** Take it off this screen. Leaving the queue is what dismisses the toast. */
  const close = useCallback(() => {
    releaseInboundOffer(call.id);
    dequeue(call.id);
    onClose();
  }, [call.id, dequeue, onClose]);

  /**
   * Ask the server for the call before touching the media leg.
   *
   * Several endpoints ring for one call, so who answered is the server's to
   * decide: the claim is a conditional update and only one of them can win
   * (`InboundCallController`). Throwing here means the call is not ours to
   * answer.
   */
  const claim = useCallback(
    async (callControlId: string) => {
      try {
        await api.post(
          `/inbound-calls/${encodeURIComponent(callControlId)}/claim`,
          {}
        );
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        const refusal =
          status === 409
            ? t('incoming.alreadyAnswered')
            : status === 410
              ? t('incoming.noLongerRinging')
              : status === 403
                ? t('incoming.notOffered')
                : null;
        if (!refusal) {
          // Not a refusal — the request never landed. The provider reports the
          // answer over its own webhook and the server elects a winner from
          // that too, so drop the claim rather than drop the call.
          console.error('⚠️ Could not claim the inbound call:', error);
          return;
        }
        toast.error(refusal);
        throw error;
      }
    },
    [api, t]
  );

  const handleAnswer = useCallback(async () => {
    if (isCurrentCallActive || answering || wrappingUp) return;
    setAnswering(true);
    try {
      if (offer?.callControlId) await claim(offer.callControlId);
      await call?.answer?.();
      // The leg names neither the Ringee call nor the caller — its
      // destination is our side of the line, and a transfer rings a leg of
      // its own. The offer does: it goes to the call screen, and the outcome
      // is saved against its call. Written before the call becomes active, so
      // the screen never sees the call without it, and never over a wrap-up
      // that opened while this call was being answered, whose outcome would
      // land on this one.
      const callState = useCallStore.getState();
      if (!callState.postCallPhase) {
        callState.setCallId(offer?.callId ?? null);
        callState.setCallPhoneNumber(callerNumber || null);
        callState.setCallContact(contact?.id ?? null, contact?.name ?? null);
      }
      setActiveCall(call);
      close();
    } catch {
      // Lost, gone, or the leg refused to answer — stop presenting it either
      // way. The refusal has already been shown.
      close();
    } finally {
      setAnswering(false);
    }
  }, [
    answering,
    call,
    callerNumber,
    claim,
    close,
    contact,
    isCurrentCallActive,
    offer?.callControlId,
    offer?.callId,
    setActiveCall,
    wrappingUp
  ]);

  const handleDecline = useCallback(() => {
    // A ring group is one call ringing several people: this member stepping
    // away must not end it for everybody else. Only a call that is ours alone
    // is hung up here.
    if (offer?.destinationType !== 'ring_group') {
      call?.hangup?.();
      // That ends only the copy of the call this device was rung with — every
      // dashboard is offered its own (`DEBT-020`) — so the caller kept
      // ringing. The server ends the call for them.
      if (offer?.callControlId)
        void api
          .post(
            `/inbound-calls/${encodeURIComponent(offer.callControlId)}/decline`,
            {}
          )
          .catch(() => undefined);
    }
    close();
  }, [api, call, close, offer?.callControlId, offer?.destinationType]);

  const role = [contact?.jobTitle, contact?.company]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='bg-background flex w-[320px] flex-col gap-3 rounded-xl border p-3 shadow-lg'>
      <div className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <Avatar className='size-9 shrink-0'>
            <AvatarFallback className='text-[11px] font-semibold'>
              {getInitials(callerName, callerNumber)}
            </AvatarFallback>
          </Avatar>
          <div className='min-w-0'>
            <p className='truncate text-sm font-semibold'>
              {callerName ?? callerNumber}
            </p>
            {role ? (
              <p className='text-muted-foreground truncate text-xs'>{role}</p>
            ) : null}
            {callerName ? (
              <p className='text-muted-foreground truncate text-xs'>
                {callerNumber}
              </p>
            ) : null}
            {contact?.email ? (
              <p className='text-muted-foreground truncate text-xs'>
                {contact.email}
              </p>
            ) : null}
          </div>
        </div>
        <span className='text-muted-foreground shrink-0 text-[10px]'>
          {t('incomingCall')}
        </span>
      </div>

      {/* Why it is ringing here: without it a group call looks like a call to
          you personally, and declining one reads very differently. */}
      {offer?.ringGroupName ? (
        <p className='text-muted-foreground flex items-center gap-1.5 text-[11px]'>
          <Users className='h-3 w-3 shrink-0' />
          <span className='truncate'>
            {t('incoming.viaRingGroup', { name: offer.ringGroupName })}
          </span>
        </p>
      ) : null}

      <div className='flex justify-center gap-3'>
        <Button
          size='icon'
          variant='destructive'
          className='h-10 w-10 rounded-full'
          aria-label={t('actions.decline')}
          onClick={handleDecline}
        >
          <PhoneOff className='h-4 w-4' />
        </Button>

        <Button
          size='icon'
          className='h-10 w-10 rounded-full bg-green-600 text-white hover:bg-green-700'
          disabled={isCurrentCallActive || answering || wrappingUp}
          aria-label={t('actions.answer')}
          onClick={handleAnswer}
        >
          <Phone className='h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
