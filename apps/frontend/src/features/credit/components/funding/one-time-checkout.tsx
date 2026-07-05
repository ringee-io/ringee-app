'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Wallet,
  Clock,
  CreditCard,
  TicketPercent,
  Loader2
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useUser } from '@clerk/nextjs';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { money, estimateMinutes } from '../../lib/recharge';
import { useBalanceReconcile } from '../../hooks/use-balance-reconcile';
import {
  ElementsCheckoutPanel,
  type CreatedIntent
} from './elements-checkout-panel';
import { FundingSummary, type SummaryRow } from './funding-summary';
import { ResultView } from '../recharge/result-view';

interface Props {
  amount: number;
  currentBalance: number;
  onBack: () => void;
  onClose: () => void;
  /** Bubble the charge-in-flight state up so the popover blocks dismissal. */
  onBusyChange?: (busy: boolean) => void;
}

/** Discount applied to the live PaymentIntent (charge only — credit is face). */
interface AppliedCoupon {
  code: string;
  label: string;
  discountUsd: number;
  chargeUsd: number;
}

// The teal focus ring + Stripe-like surface, matched to the card fields.
const fieldClasses = cn(
  'rounded-[10px] shadow-sm dark:shadow-none',
  'border-black/10 bg-white dark:border-white/10 dark:bg-[#17171b]',
  'focus-visible:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500/40'
);

/**
 * One-time top-up via the custom Stripe Elements checkout, hosted inside the
 * funding popover. Adds a Ringee-owned save-card consent (checked by default)
 * and a discount-code field. Both update the LIVE PaymentIntent in place — the
 * card details are never wiped — so toggling save or applying a coupon no longer
 * recreates the checkout. Credited ONLY by the confirmed webhook (the credited
 * amount is always the face value, even when a coupon lowers the charge).
 */
export function OneTimeCheckout({
  amount,
  currentBalance,
  onBack,
  onClose,
  onBusyChange
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const api = useApi();
  const { user } = useUser();
  const fetchPaymentMethod = useCreditStore((s) => s.fetchPaymentMethod);
  const liveBalance = useCreditStore((s) => s.balance);
  const { reflected, start } = useBalanceReconcile();

  // Consent to save the card for one-click future top-ups. Checked by default
  // (transparent, user can uncheck). Baseline balance is captured once so the
  // projected total stays stable even as the live balance updates.
  const [savePaymentMethod, setSavePaymentMethod] = useState(true);
  const baselineRef = useRef(currentBalance);
  const projected = baselineRef.current + amount;

  // The live PaymentIntent id — needed to update save-preference / coupon in
  // place. Set once the intent is created (below), reset on every recreate.
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [showCoupon, setShowCoupon] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const chargeUsd = coupon ? coupon.chargeUsd : amount;

  const createIntent = useCallback(async (): Promise<CreatedIntent> => {
    const res = await api.post('/stripe/checkout/credit/intent', {
      amount,
      savePaymentMethod,
      invoiceEmail: user?.primaryEmailAddress?.emailAddress
    });
    // A brand-new intent carries no discount — reset the coupon UI to match.
    setPaymentIntentId(res.paymentIntentId ?? null);
    setCoupon(null);
    setCouponError(null);
    setCouponInput('');
    setShowCoupon(false);
    return {
      clientSecret: res.clientSecret,
      intentId: res.paymentIntentId ?? null,
      billingEmail: res.billingEmail ?? null
    };
  }, [api, amount, savePaymentMethod, user]);

  const persistEmail = useCallback(
    async (email: string, paymentIntentId: string | null) => {
      await api.post('/stripe/checkout/billing-email', {
        email,
        paymentIntentId: paymentIntentId ?? undefined
      });
    },
    [api]
  );

  // Toggle "save card" on the live intent WITHOUT recreating it — the mounted
  // card fields (and anything typed) survive. Optimistic; a failure just logs.
  const handleToggleSave = useCallback(
    async (checked: boolean) => {
      setSavePaymentMethod(checked);
      if (!paymentIntentId) return;
      try {
        await api.post('/stripe/checkout/credit/save-preference', {
          paymentIntentId,
          savePaymentMethod: checked
        });
      } catch (err) {
        console.error('Failed to update save-card preference:', err);
      }
    },
    [api, paymentIntentId]
  );

  const applyCoupon = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || !paymentIntentId) return;
      setApplyingCoupon(true);
      setCouponError(null);
      try {
        const res = await api.post('/stripe/checkout/credit/apply-coupon', {
          paymentIntentId,
          code
        });
        setCoupon({
          code: res.code,
          label: res.label || res.code,
          discountUsd: res.discountUsd,
          chargeUsd: res.chargeUsd
        });
      } catch (err) {
        setCoupon(null);
        setCouponError(
          err instanceof Error ? err.message : t('coupon.invalid')
        );
      } finally {
        setApplyingCoupon(false);
      }
    },
    [api, paymentIntentId, t]
  );

  const removeCoupon = useCallback(async () => {
    setCoupon(null);
    setCouponError(null);
    setCouponInput('');
    if (!paymentIntentId) return;
    try {
      await api.post('/stripe/checkout/credit/apply-coupon', {
        paymentIntentId,
        code: ''
      });
    } catch (err) {
      console.error('Failed to remove coupon:', err);
    }
  }, [api, paymentIntentId]);

  const onComplete = useCallback(() => {
    // Refresh the saved-method state so the next open can offer the fast path
    // with the card we just saved, then reconcile the webhook-credited balance.
    fetchPaymentMethod(api);
    start();
  }, [api, fetchPaymentMethod, start]);

  const summaryRows: SummaryRow[] = [
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
  ];
  if (coupon) {
    summaryRows.push(
      {
        label: t('coupon.discountRow'),
        value: `−${money(coupon.discountUsd)}`,
        icon: TicketPercent,
        accent: true
      },
      {
        label: t('coupon.youPayRow'),
        value: money(coupon.chargeUsd),
        icon: CreditCard
      }
    );
  }

  return (
    <ElementsCheckoutPanel
      title={t('checkout.title')}
      subtitle={t('checkout.subtitle', { amount: money(amount) })}
      badge={money(amount)}
      backLabel={t('checkout.changeAmount')}
      onBack={onBack}
      onClose={onClose}
      onBusyChange={onBusyChange}
      createIntent={createIntent}
      sessionKey={amount}
      intentKind='payment'
      submitLabel={t('checkout.payNow', { amount: money(chargeUsd) })}
      showEmailField
      persistEmail={persistEmail}
      summary={
        <FundingSummary
          label={t('checkout.amountLabel')}
          amount={amount}
          fundingType={t('tabs.oneTime')}
          rows={summaryRows}
          note={t('checkout.creditsNote')}
          confidence
        />
      }
      belowForm={
        <div className='space-y-3'>
          <label
            htmlFor='save-pm'
            className='border-border/60 bg-muted/20 flex cursor-pointer items-start gap-2.5 rounded-xl border p-3'
          >
            <Checkbox
              id='save-pm'
              checked={savePaymentMethod}
              onCheckedChange={(c) => handleToggleSave(c === true)}
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

          {/* Discount coupon: a quiet prompt that reveals an input + Apply. */}
          <div className='space-y-2'>
            {!coupon && !showCoupon && (
              <button
                type='button'
                onClick={() => setShowCoupon(true)}
                className='text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium underline-offset-2 hover:underline'
              >
                <TicketPercent className='h-3.5 w-3.5' />
                {t('coupon.prompt')}
              </button>
            )}

            {!coupon && showCoupon && (
              <div className='flex items-center gap-2'>
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyCoupon(couponInput);
                    }
                  }}
                  placeholder={t('coupon.placeholder')}
                  autoFocus
                  className={cn('h-10 flex-1 px-3 text-sm', fieldClasses)}
                />
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => applyCoupon(couponInput)}
                  disabled={applyingCoupon || !couponInput.trim()}
                  className='h-10 shrink-0 cursor-pointer'
                >
                  {applyingCoupon ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    t('coupon.apply')
                  )}
                </Button>
              </div>
            )}

            {coupon && (
              <div className='flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2'>
                <span className='flex min-w-0 items-center gap-2 text-xs'>
                  <TicketPercent className='h-4 w-4 shrink-0 text-emerald-500' />
                  <span className='truncate font-medium'>
                    {t('coupon.appliedLabel', { code: coupon.code })}
                  </span>
                  <span className='font-semibold text-emerald-600 tabular-nums dark:text-emerald-400'>
                    {`−${money(coupon.discountUsd)}`}
                  </span>
                </span>
                <button
                  type='button'
                  onClick={removeCoupon}
                  className='text-muted-foreground hover:text-foreground shrink-0 cursor-pointer text-xs font-medium'
                >
                  {t('coupon.remove')}
                </button>
              </div>
            )}

            {couponError && (
              <p className='text-[11px] text-red-500 dark:text-red-400'>
                {couponError}
              </p>
            )}
          </div>
        </div>
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
