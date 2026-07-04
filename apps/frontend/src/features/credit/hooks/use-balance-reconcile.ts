'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';

// Crediting happens in the Stripe webhook, which can lag the client by a second
// or two. After a confirmed payment we re-fetch the balance a few times before
// settling on the honest "will appear shortly" copy — never assuming success
// from the client alone.
const BALANCE_POLL_ATTEMPTS = 6;
const BALANCE_POLL_INTERVAL_MS = 2000;

/**
 * Post-payment balance reconciliation shared by every funding flow that credits
 * via webhook (one-time embedded, monthly setup, saved-card fast path). Captures
 * the pre-payment balance as a baseline and marks `reflected` the moment the
 * webhook-credited balance rises above it. Uses silent refreshes so the open
 * panel is never torn down mid-reconciliation.
 */
export function useBalanceReconcile() {
  const api = useApi();
  const fetchBalance = useCreditStore((s) => s.fetchBalance);

  const [reflected, setReflected] = useState(false);
  const baselineRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const run = useCallback(
    async (attempt = 0) => {
      await fetchBalance(api, false, true);
      const latest = useCreditStore.getState().balance;
      if (latest > baselineRef.current) {
        setReflected(true);
        return;
      }
      if (attempt + 1 >= BALANCE_POLL_ATTEMPTS) return;
      timer.current = setTimeout(
        () => run(attempt + 1),
        BALANCE_POLL_INTERVAL_MS
      );
    },
    [api, fetchBalance]
  );

  /** Begin reconciling from the current balance as the baseline. */
  const start = useCallback(() => {
    setReflected(false);
    baselineRef.current = useCreditStore.getState().balance;
    run();
  }, [run]);

  return { reflected, start };
}
