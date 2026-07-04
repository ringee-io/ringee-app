'use client';

import { useCallback, useRef, useState } from 'react';
import { Wallet, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { money, estimateMinutes } from '../../lib/recharge';
import { useBalanceReconcile } from '../../hooks/use-balance-reconcile';
import { EmbeddedStripePanel } from './embedded-stripe-panel';
import { FundingSummary } from './funding-summary';
import { ResultView } from '../recharge/result-view';

interface Props {
  amount: number;
  currentBalance: number;
  onBack: () => void;
  onClose: () => void;
}

/**
 * One-time top-up via Stripe Embedded Checkout, hosted in the generic funding
 * panel. Adds a Ringee-owned save-card consent (checked by default) that drives
 * `setup_future_usage` server-side — toggling it recreates the session. Credited
 * ONLY by the confirmed webhook; the result view reconciles the balance.
 */
export function OneTimeCheckout({
  amount,
  currentBalance,
  onBack,
  onClose
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const api = useApi();
  const fetchPaymentMethod = useCreditStore((s) => s.fetchPaymentMethod);
  const liveBalance = useCreditStore((s) => s.balance);
  const { reflected, start } = useBalanceReconcile();

  // Consent to save the card for one-click future top-ups. Checked by default
  // (transparent, user can uncheck). Baseline balance is captured once so the
  // projected total stays stable even as the live balance updates.
  const [savePaymentMethod, setSavePaymentMethod] = useState(true);
  const baselineRef = useRef(currentBalance);
  const projected = baselineRef.current + amount;

  const createSession = useCallback(async () => {
    const res = await api.post('/stripe/checkout/credit/embedded', {
      amount,
      frontendOrigin: window.location.origin,
      savePaymentMethod
    });
    return { clientSecret: res.clientSecret, sessionId: res.sessionId ?? null };
  }, [api, amount, savePaymentMethod]);

  const onComplete = useCallback(
    async (sessionId: string | null) => {
      // Defensive server-side confirmation — never trust the client callback on
      // its own. Refresh the saved-method state so the next open can offer the
      // fast path with the card we just saved.
      try {
        if (sessionId) {
          await api.get(`/stripe/checkout/credit/session/${sessionId}`);
        }
      } catch (err) {
        console.error('Failed to read checkout session status:', err);
      }
      fetchPaymentMethod(api);
      start();
    },
    [api, fetchPaymentMethod, start]
  );

  return (
    <EmbeddedStripePanel
      title={t('checkout.title')}
      subtitle={t('checkout.subtitle', { amount: money(amount) })}
      badge={money(amount)}
      backLabel={t('checkout.changeAmount')}
      onBack={onBack}
      createSession={createSession}
      sessionKey={`${amount}:${savePaymentMethod}`}
      summary={
        <FundingSummary
          label={t('checkout.amountLabel')}
          amount={amount}
          fundingType={t('tabs.oneTime')}
          rows={[
            {
              label: t('checkout.newBalanceLabel'),
              value: money(projected),
              icon: Wallet,
              accent: true
            },
            {
              label: t('checkout.estCallingTime'),
              value: t('checkout.minutesValue', {
                minutes: estimateMinutes(amount).toLocaleString()
              }),
              icon: Clock
            }
          ]}
          note={t('checkout.creditsNote')}
          confidence
          sticky
        />
      }
      belowSummary={
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
      }
      onComplete={onComplete}
      result={
        <ResultView
          creditReflected={reflected}
          projectedBalance={projected}
          liveBalance={liveBalance}
          onClose={onClose}
        />
      }
    />
  );
}
