'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, PhoneOff, Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Call } from '@telnyx/webrtc';
import { useTranslations } from 'next-intl';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { useTelnyxStore } from '../store/telnyx.store';
import {
  releaseInboundOffer,
  useInboundOffer
} from '../store/inbound-offers.store';

export function IncomingCall({
  call,
  onClose
}: {
  call: Call;
  onClose: () => void;
}) {
  const t = useTranslations('calls');
  const api = useApi();
  const setActiveCall = useTelnyxStore((s) => s.setActiveCall);
  const activeCall = useTelnyxStore((s) => s.activeCall);
  const dequeue = useTelnyxStore((s) => s.dequeue);
  /** What the server said about this leg — absent on the legacy fallback path. */
  const offer = useInboundOffer(call.id);
  const [answering, setAnswering] = useState(false);

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
    if (isCurrentCallActive || answering) return;
    setAnswering(true);
    try {
      if (offer?.callControlId) await claim(offer.callControlId);
      await call?.answer?.();
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
    claim,
    close,
    isCurrentCallActive,
    offer?.callControlId,
    setActiveCall
  ]);

  const handleDecline = useCallback(() => {
    // A ring group is one call ringing several people: this member stepping
    // away must not end it for everybody else. Only a call that is ours alone
    // is hung up here.
    if (offer?.destinationType !== 'ring_group') call?.hangup?.();
    close();
  }, [call, close, offer?.destinationType]);

  const callerName = offer?.callerName ?? call.options?.callerName;
  const callerNumber = offer?.fromNumber ?? call.options?.callerNumber;

  return (
    <div className='bg-background flex w-[320px] flex-col gap-3 rounded-xl border p-3 shadow-lg'>
      <div className='flex items-center justify-between gap-2'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-semibold'>
            {callerName ?? callerNumber}
          </p>
          <p className='text-muted-foreground truncate text-xs'>
            {callerNumber}
          </p>
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
          disabled={isCurrentCallActive || answering}
          aria-label={t('actions.answer')}
          onClick={handleAnswer}
        >
          <Phone className='h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
