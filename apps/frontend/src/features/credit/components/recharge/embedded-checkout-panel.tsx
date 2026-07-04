'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout
} from '@stripe/react-stripe-js';
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { getStripe, STRIPE_PUBLISHABLE_KEY } from '../../lib/stripe';
import { money } from '../../lib/recharge';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { CheckoutSummary } from './checkout-summary';
import { ResultView } from './result-view';

/** Discrete states the checkout view moves through. */
type Phase = 'loading' | 'ready' | 'error' | 'completed';

interface Props {
  /** Validated amount the user chose in the selection step (USD). */
  amount: number;
  /** Return to the amount-selection step. */
  onBack: () => void;
  /** Close the whole popover (used by the post-payment "Done" action). */
  onClose: () => void;
}

const stripePromise = getStripe();

// How aggressively we reconcile the balance after Stripe confirms the payment.
// Crediting happens in the webhook, which can lag the client by a second or two.
const BALANCE_POLL_ATTEMPTS = 6;
const BALANCE_POLL_INTERVAL_MS = 2000;

export function EmbeddedCheckoutPanel({ amount, onBack, onClose }: Props) {
  const t = useTranslations('billing.credits.popover');
  const api = useApi();
  const fetchBalance = useCreditStore((s) => s.fetchBalance);
  const liveBalance = useCreditStore((s) => s.balance);
  const fetchPaymentMethod = useCreditStore((s) => s.fetchPaymentMethod);

  const [phase, setPhase] = useState<Phase>('loading');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creditReflected, setCreditReflected] = useState(false);

  // Consent to save the card for one-click future top-ups. Checked by default
  // (transparent, user can uncheck). Drives `setup_future_usage` server-side.
  const [savePaymentMethod, setSavePaymentMethod] = useState(true);
  const saveRef = useRef(savePaymentMethod);
  saveRef.current = savePaymentMethod;

  // Balance at the moment checkout started — the baseline we compare against to
  // decide whether the webhook has already credited the account.
  const baselineBalanceRef = useRef(useCreditStore.getState().balance);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectedBalance = baselineBalanceRef.current + amount;

  const createSession = useCallback(async () => {
    setPhase('loading');
    try {
      const { clientSecret: secret, sessionId: id } = await api.post(
        '/stripe/checkout/credit/embedded',
        {
          amount,
          frontendOrigin: window.location.origin,
          savePaymentMethod: saveRef.current
        }
      );
      if (!secret) throw new Error('Missing client secret');
      setClientSecret(secret);
      setSessionId(id ?? null);
      setPhase('ready');
    } catch (err) {
      console.error('Failed to create embedded checkout session:', err);
      setPhase('error');
    }
  }, [amount, api]);

  // Kick off session creation once, when the panel mounts for this amount. A
  // missing publishable key is a hard error surfaced to the user.
  useEffect(() => {
    if (!STRIPE_PUBLISHABLE_KEY) {
      setPhase('error');
      return;
    }
    createSession();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `setup_future_usage` is fixed at session creation, so toggling consent means
  // recreating the session. Skip the initial mount (handled above).
  const firstConsentRender = useRef(true);
  useEffect(() => {
    if (firstConsentRender.current) {
      firstConsentRender.current = false;
      return;
    }
    if (STRIPE_PUBLISHABLE_KEY) createSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savePaymentMethod]);

  // Reconcile the balance after payment. The moment the balance rises above the
  // pre-checkout baseline we mark the credit as reflected.
  const reconcileBalance = useCallback(
    async (attempt = 0) => {
      // Silent refresh: update the balance without flipping the store to
      // 'loading', which would tear this panel down mid-reconciliation.
      await fetchBalance(api, false, true);
      const latest = useCreditStore.getState().balance;
      if (latest > baselineBalanceRef.current) {
        setCreditReflected(true);
        return;
      }
      if (attempt + 1 >= BALANCE_POLL_ATTEMPTS) return;
      pollTimer.current = setTimeout(
        () => reconcileBalance(attempt + 1),
        BALANCE_POLL_INTERVAL_MS
      );
    },
    [api, fetchBalance]
  );

  const handleComplete = useCallback(async () => {
    setPhase('completed');
    // Defensive server-side confirmation — never trust the client callback on
    // its own. Refresh the saved-method state too, so the next open can offer
    // the fast path with the card we just saved.
    try {
      if (sessionId) {
        await api.get(`/stripe/checkout/credit/session/${sessionId}`);
      }
    } catch (err) {
      console.error('Failed to read checkout session status:', err);
    }
    fetchPaymentMethod(api);
    reconcileBalance();
  }, [api, sessionId, reconcileBalance, fetchPaymentMethod]);

  const missingKey = !STRIPE_PUBLISHABLE_KEY;

  return (
    <div className='bg-background flex max-h-[85vh] flex-col sm:max-h-[82vh]'>
      {/* Header */}
      <header className='border-border/60 flex shrink-0 items-center gap-3 border-b px-5 py-4'>
        <button
          type='button'
          onClick={onBack}
          disabled={phase === 'completed'}
          aria-label={t('checkout.changeAmount')}
          className={cn(
            'border-border/70 bg-muted/30 text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
            'hover:text-foreground hover:border-border cursor-pointer disabled:pointer-events-none disabled:opacity-40'
          )}
        >
          <ArrowLeft className='h-4 w-4' />
        </button>

        <div className='min-w-0 flex-1'>
          <p className='text-[15px] font-semibold tracking-tight'>
            {t('checkout.title')}
          </p>
          <p className='text-muted-foreground truncate text-xs'>
            {t('checkout.subtitle', { amount: money(amount) })}
          </p>
        </div>

        <div className='border-border/70 bg-muted/40 shrink-0 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums'>
          {money(amount)}
        </div>
      </header>

      {/* Body */}
      <div className='@container min-h-0 flex-1 overflow-y-auto'>
        {phase === 'loading' && (
          <div className='flex flex-col items-center justify-center gap-3 px-6 py-20 text-center'>
            <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
            <p className='text-muted-foreground text-sm'>
              {t('checkout.loading')}
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className='flex flex-col items-center justify-center gap-3 px-6 py-16 text-center'>
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
                onClick={createSession}
                className='mt-1 cursor-pointer'
              >
                {t('checkout.retry')}
              </Button>
            )}
          </div>
        )}

        {phase === 'completed' && (
          <ResultView
            creditReflected={creditReflected}
            projectedBalance={projectedBalance}
            liveBalance={liveBalance}
            onClose={onClose}
          />
        )}

        {phase === 'ready' && clientSecret && (
          <div className='animate-in fade-in-0 grid grid-cols-1 gap-4 p-4 duration-300 @[600px]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] @[600px]:gap-5 @[600px]:p-5'>
            <div className='flex flex-col gap-3 @[600px]:sticky @[600px]:top-0 @[600px]:self-start'>
              <CheckoutSummary
                amount={amount}
                currentBalance={baselineBalanceRef.current}
              />

              {/* Save-card consent — Ringee's own control (not Stripe's UI). */}
              <label
                htmlFor='save-pm'
                className='border-border/60 bg-muted/20 flex cursor-pointer items-start gap-2.5 rounded-xl border p-3'
              >
                <Checkbox
                  id='save-pm'
                  checked={savePaymentMethod}
                  onCheckedChange={(c) => setSavePaymentMethod(c === true)}
                  className='mt-0.5'
                />
                <div className='space-y-0.5'>
                  <Label
                    htmlFor='save-pm'
                    className='cursor-pointer text-xs font-medium'
                  >
                    {t('consent.save')}
                  </Label>
                  <p className='text-muted-foreground text-[11px] leading-snug'>
                    {t('consent.hint')}
                  </p>
                </div>
              </label>
            </div>

            {/* Stripe lives inside a light surface so the (white) form reads as
                an intentional card floating on the dark shell, not a raw embed. */}
            <div className='min-w-0'>
              <div className='overflow-hidden rounded-xl bg-white p-2 shadow-xl ring-1 ring-black/5 @[600px]:p-3'>
                <EmbeddedCheckoutProvider
                  key={clientSecret}
                  stripe={stripePromise}
                  options={{ clientSecret, onComplete: handleComplete }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {phase !== 'completed' && (
        <footer className='border-border/60 text-muted-foreground flex shrink-0 items-center justify-center gap-4 border-t px-5 py-3 text-[11px]'>
          <span className='flex items-center gap-1.5'>
            <ShieldCheck className='h-3.5 w-3.5 text-emerald-400' />
            {t('footer.secureByStripe')}
          </span>
          <span className='bg-border/70 h-3 w-px' />
          <span className='flex items-center gap-1.5'>
            <Lock className='h-3.5 w-3.5' />
            {t('footer.cardSafety')}
          </span>
        </footer>
      )}
    </div>
  );
}
