'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout
} from '@stripe/react-stripe-js';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { getStripe, STRIPE_PUBLISHABLE_KEY } from '../../lib/stripe';
import { FundingPanelShell } from './funding-chrome';

const stripePromise = getStripe();

/** Discrete states the embedded panel moves through. */
type Phase = 'loading' | 'ready' | 'error' | 'completed';

export interface EmbeddedSession {
  clientSecret: string;
  sessionId: string | null;
}

interface Props {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  onBack: () => void;
  backLabel?: string;
  /** Create (or recreate) the Stripe session for this flow. */
  createSession: () => Promise<EmbeddedSession>;
  /**
   * Recreate the session whenever this changes. `setup_future_usage` (and the
   * session mode) are fixed at creation time, so toggling e.g. a save-card
   * consent must recreate the session — bump this key to do it.
   */
  sessionKey?: string | number;
  /** Left column: the Ringee funding summary. */
  summary: React.ReactNode;
  /** Optional block under the summary (consent, hints). */
  belowSummary?: React.ReactNode;
  /** Fired once Stripe confirms the payment (client callback — verify server-side). */
  onComplete?: (sessionId: string | null) => void;
  /** Rendered in the `completed` phase (success / reconcile view). */
  result: React.ReactNode;
  /** Disable the back button (e.g. while completing). */
  backDisabled?: boolean;
}

/**
 * Generic Stripe Embedded Checkout host used by every funding flow that needs
 * a card form (one-time top-up, monthly subscription, card setup). Owns the
 * session lifecycle (loading / ready / error) and the completed hand-off; each
 * caller supplies its own summary, optional consent, and result view. The
 * Stripe form lives on a light surface inside the dark shell and the WHOLE
 * panel scrolls — never a cramped inner box.
 */
export function EmbeddedStripePanel({
  title,
  subtitle,
  badge,
  onBack,
  backLabel,
  createSession,
  sessionKey,
  summary,
  belowSummary,
  onComplete,
  result,
  backDisabled
}: Props) {
  const t = useTranslations('billing.credits.popover');

  const [phase, setPhase] = useState<Phase>('loading');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const missingKey = !STRIPE_PUBLISHABLE_KEY;

  const create = useCallback(async () => {
    setPhase('loading');
    try {
      const { clientSecret: secret, sessionId } = await createSession();
      if (!secret) throw new Error('Missing client secret');
      sessionIdRef.current = sessionId;
      setClientSecret(secret);
      setPhase('ready');
    } catch (err) {
      console.error('Failed to create Stripe session:', err);
      setPhase('error');
    }
  }, [createSession]);

  // Create on mount and whenever the session key changes (consent toggle, etc.).
  useEffect(() => {
    if (missingKey) {
      setPhase('error');
      return;
    }
    create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const handleComplete = useCallback(() => {
    setPhase('completed');
    onComplete?.(sessionIdRef.current);
  }, [onComplete]);

  return (
    <FundingPanelShell
      title={title}
      subtitle={subtitle}
      badge={badge}
      onBack={onBack}
      backLabel={backLabel}
      backDisabled={backDisabled || phase === 'completed'}
      hideFooter={phase === 'completed'}
    >
      {phase === 'loading' && (
        <div className='flex flex-col items-center justify-center gap-3 px-6 py-24 text-center'>
          <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
          <p className='text-muted-foreground text-sm'>
            {t('checkout.loading')}
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className='flex flex-col items-center justify-center gap-3 px-6 py-20 text-center'>
          <div className='flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10'>
            <AlertTriangle className='h-5 w-5 text-red-400' />
          </div>
          <p className='text-sm font-medium'>
            {missingKey
              ? t('checkout.missingKeyTitle')
              : t('checkout.errorTitle')}
          </p>
          <p className='text-muted-foreground max-w-[38ch] text-xs'>
            {missingKey
              ? t('checkout.missingKeyBody')
              : t('checkout.errorBody')}
          </p>
          {!missingKey && (
            <Button
              variant='outline'
              size='sm'
              onClick={create}
              className='mt-1 cursor-pointer'
            >
              {t('checkout.retry')}
            </Button>
          )}
        </div>
      )}

      {phase === 'completed' && result}

      {phase === 'ready' && clientSecret && (
        <div className='animate-in fade-in-0 grid grid-cols-1 gap-5 p-5 duration-300 @[640px]:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]'>
          <div className='flex flex-col gap-3'>
            {summary}
            {belowSummary}
          </div>

          {/* Stripe on a light surface so the (white) form reads as an
              intentional card floating on the dark shell — not a raw embed.
              Roomy min width so the form is never squeezed. */}
          <div className='min-w-0 @[640px]:min-w-[34rem]'>
            <div className='overflow-hidden rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5 @[640px]:p-4'>
              <EmbeddedCheckoutProvider
                key={clientSecret}
                stripe={stripePromise}
                options={{ clientSecret, onComplete: handleComplete }}
              >
                <EmbededCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        </div>
      )}
    </FundingPanelShell>
  );
}
