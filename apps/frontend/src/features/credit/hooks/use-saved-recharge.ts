'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { getStripe } from '../lib/stripe';

/** Discrete phases of a one-click saved-card recharge. */
export type SavedRechargePhase =
  | 'idle'
  | 'processing' // charging server-side
  | 'authenticating' // completing 3-D Secure in the browser
  | 'succeeded' // Stripe confirmed; balance reconciling
  | 'failed'; // declined / errored — offer "use another method"

// Reconcile the balance after Stripe confirms. Crediting happens in the
// webhook, which can lag the client by a second or two, so we re-fetch a few
// times before settling on the honest "will appear shortly" copy. We never
// assume success from the client alone.
const BALANCE_POLL_ATTEMPTS = 6;
const BALANCE_POLL_INTERVAL_MS = 2000;

interface SavedRechargeResponse {
  status: 'succeeded' | 'processing' | 'requires_action' | 'failed';
  paymentIntentId: string | null;
  clientSecret: string | null;
}

/**
 * Drives the fast recharge against a saved card:
 *  1. POST /stripe/checkout/credit/saved — server confirms an off-session
 *     PaymentIntent (payment-method id resolved server-side).
 *  2. If it needs 3-D Secure, complete authentication in the browser via
 *     `stripe.handleNextAction`, then re-confirm the status server-side.
 *  3. On success, reconcile the balance (credits land via the webhook).
 *
 * The balance is never mutated here — the confirmed `payment_intent.succeeded`
 * webhook is the only thing that adds credits.
 */
export function useSavedRecharge() {
  const api = useApi();
  const fetchBalance = useCreditStore((s) => s.fetchBalance);

  const [phase, setPhase] = useState<SavedRechargePhase>('idle');
  const [creditReflected, setCreditReflected] = useState(false);

  const baselineBalanceRef = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a fast double-invoke creating two PaymentIntents (two
  // charges) before React re-renders the disabled button.
  const inFlightRef = useRef(false);

  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    []
  );

  const reconcileBalance = useCallback(
    async (attempt = 0) => {
      // Silent refresh: reconcile the balance without flipping the store to
      // 'loading', so the success view stays mounted while credits land.
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

  const confirmServerSide = useCallback(
    async (paymentIntentId: string): Promise<string | undefined> => {
      try {
        const res = await api.get(
          `/stripe/payment-intent/${paymentIntentId}/status`
        );
        return res?.status as string | undefined;
      } catch (err) {
        console.error('Failed to confirm payment intent status:', err);
        return undefined;
      }
    },
    [api]
  );

  const start = useCallback(
    async (amount: number) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setCreditReflected(false);
      baselineBalanceRef.current = useCreditStore.getState().balance;
      setPhase('processing');

      try {
        const res = await api.post<SavedRechargeResponse>(
          '/stripe/checkout/credit/saved',
          { amount }
        );

        let status: string = res?.status;
        const { paymentIntentId, clientSecret } = res ?? {};

        // Saved card needs 3-D Secure — complete it in place, then trust the
        // server's read of the result, not the client callback.
        if (status === 'requires_action' && clientSecret) {
          setPhase('authenticating');
          const stripe = await getStripe();
          if (!stripe) {
            setPhase('failed');
            return;
          }
          const { error } = await stripe.handleNextAction({ clientSecret });
          if (error) {
            setPhase('failed');
            return;
          }
          status = paymentIntentId
            ? ((await confirmServerSide(paymentIntentId)) ?? 'succeeded')
            : 'succeeded';
        }

        if (status === 'succeeded' || status === 'processing') {
          setPhase('succeeded');
          reconcileBalance();
          return;
        }

        setPhase('failed');
      } catch (err) {
        console.error('Saved-card recharge failed:', err);
        setPhase('failed');
      } finally {
        inFlightRef.current = false;
      }
    },
    [api, confirmServerSide, reconcileBalance]
  );

  const reset = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setCreditReflected(false);
    setPhase('idle');
  }, []);

  return { phase, creditReflected, start, reset };
}
