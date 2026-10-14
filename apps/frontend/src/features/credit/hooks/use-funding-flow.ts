'use client';

import { useCallback, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';

export type FundingTab = 'one-time' | 'monthly' | 'auto-reload';

// The full-panel takeovers that replace the hub (tab selector) while active.
export type FlowStep =
  | null
  | 'one-time-saved'
  | 'one-time-checkout'
  | 'monthly-setup'
  | 'monthly-change-card'
  | 'auto-reload-change-card';

// The steps that render the big two-column checkout. While one is active every
// dismissal of the host is guarded: outside click / Esc go back a step, they
// never discard the flow.
const CHECKOUT_STEPS: FlowStep[] = [
  'one-time-checkout',
  'monthly-setup',
  'monthly-change-card',
  'auto-reload-change-card'
];

/**
 * The state of the funding center (One-time, Monthly, Auto-reload), owned by
 * whoever hosts it — the header's CreditPopover or the billing page — so the
 * host can guard its own dismissal while a step or a charge is in flight.
 * `FundingFlow` renders it.
 */
export function useFundingFlow() {
  const api = useApi();
  const [tab, setTab] = useState<FundingTab>('one-time');
  const [flowStep, setFlowStep] = useState<FlowStep>(null);
  const [dir, setDir] = useState(1);
  const [paymentInFlight, setPaymentInFlight] = useState(false);
  // Whether the host is at its wide, two-column checkout size. Flipped in the
  // AnimatePresence handoff (see `FundingFlow`) so the width only changes in
  // the invisible gap between the old step leaving and the new one entering —
  // each step is therefore always rendered at its own correct width.
  const [wide, setWide] = useState(false);

  // Primary inputs live here so "back" from any takeover preserves them.
  const [amount, setAmount] = useState(25);
  const [monthlyAmount, setMonthlyAmount] = useState(50);
  const [threshold, setThreshold] = useState(10);
  const [reloadAmount, setReloadAmount] = useState(25);

  const checkoutStep = CHECKOUT_STEPS.includes(flowStep);

  // Forward into a flow (slide left→right); `back` reverses it.
  const goTo = useCallback((step: Exclude<FlowStep, null>) => {
    setDir(1);
    setFlowStep(step);
  }, []);
  const back = useCallback(() => {
    setDir(-1);
    setFlowStep(null);
  }, []);
  // Drop any active step and land on the compact One-time hub, so "Done" never
  // leaves a detached checkout mounted.
  const reset = useCallback(() => {
    setDir(1);
    setFlowStep(null);
    setTab('one-time');
    setWide(false);
  }, []);

  // Offer the last top-up again when it is still a valid purchase.
  const presetLastTopup = useCallback(() => {
    const { lastTopupAmount, minimumCreditPurchase } =
      useCreditStore.getState();
    if (lastTopupAmount && lastTopupAmount >= minimumCreditPurchase)
      setAmount(lastTopupAmount);
  }, []);

  const refreshFunding = useCallback(
    (useMock = false) => {
      if (useMock) return;
      const store = useCreditStore.getState();
      store.fetchAutoReloadSettings(api);
      store.fetchMonthlyFund(api);
      store.fetchPaymentMethod(api);
    },
    [api]
  );

  return {
    tab,
    setTab,
    flowStep,
    dir,
    checkoutStep,
    // A live charge or an active checkout step hard-blocks outside-close
    // (going back is fine).
    blockOutside: paymentInFlight || checkoutStep,
    paymentInFlight,
    setPaymentInFlight,
    wide,
    setWide,
    amount,
    setAmount,
    monthlyAmount,
    setMonthlyAmount,
    threshold,
    setThreshold,
    reloadAmount,
    setReloadAmount,
    goTo,
    back,
    reset,
    presetLastTopup,
    refreshFunding
  };
}

export type FundingFlowState = ReturnType<typeof useFundingFlow>;
