'use client';

import { useCallback } from 'react';
import { CalendarSync, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { money, estimateMinutes } from '../../lib/recharge';
import { useBalanceReconcile } from '../../hooks/use-balance-reconcile';
import { EmbeddedStripePanel } from './embedded-stripe-panel';
import { FundingSummary } from './funding-summary';

interface Props {
  amount: number;
  onBack: () => void;
  onClose: () => void;
}

/**
 * Set up recurring monthly funding via an embedded Stripe SUBSCRIPTION checkout.
 * The first (and every) paid invoice credits the balance from the webhook, so
 * the result view reconciles the balance just like a one-time top-up. No
 * redirect; consent to the recurring charge was captured before entering here.
 */
export function MonthlySetupPanel({ amount, onBack, onClose }: Props) {
  const t = useTranslations('billing.credits.popover');
  const api = useApi();
  const fetchMonthlyFund = useCreditStore((s) => s.fetchMonthlyFund);
  const fetchAutoReloadSettings = useCreditStore(
    (s) => s.fetchAutoReloadSettings
  );
  const liveBalance = useCreditStore((s) => s.balance);
  const { reflected, start } = useBalanceReconcile();

  const createSession = useCallback(async () => {
    const res = await api.post(
      '/stripe/checkout/credit-subscription/embedded',
      {
        amount,
        frontendOrigin: window.location.origin
      }
    );
    return { clientSecret: res.clientSecret, sessionId: res.sessionId ?? null };
  }, [api, amount]);

  const onComplete = useCallback(() => {
    fetchMonthlyFund(api);
    fetchAutoReloadSettings(api);
    start();
  }, [api, fetchMonthlyFund, fetchAutoReloadSettings, start]);

  return (
    <EmbeddedStripePanel
      title={t('monthly.setupTitle')}
      subtitle={t('monthly.setupSubtitle', { amount: money(amount) })}
      badge={`${money(amount)}${t('monthly.perMonthSuffix')}`}
      onBack={onBack}
      backLabel={t('monthly.setupTitle')}
      createSession={createSession}
      summary={
        <FundingSummary
          label={t('monthly.amountLabel')}
          amount={amount}
          suffix={t('monthly.perMonthSuffix')}
          fundingType={t('tabs.monthly')}
          rows={[
            {
              label: t('monthly.frequencyRow'),
              value: t('monthly.frequencyValue'),
              icon: CalendarSync
            },
            {
              label: t('monthly.estTimeRow'),
              value: t('checkout.minutesValue', {
                minutes: estimateMinutes(amount).toLocaleString()
              }),
              icon: Clock
            }
          ]}
          note={t('monthly.creditsNote')}
          confidence
          sticky
        />
      }
      onComplete={onComplete}
      result={
        <div className='animate-in fade-in-0 zoom-in-95 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center duration-300'>
          <div className='flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-8 ring-emerald-500/20'>
            <CheckCircle2 className='h-7 w-7 text-emerald-400' />
          </div>
          <div className='space-y-1'>
            <p className='text-lg font-semibold tracking-tight'>
              {t('monthly.setupDoneTitle')}
            </p>
            <p className='text-muted-foreground mx-auto max-w-[42ch] text-sm'>
              {t('monthly.setupDoneBody', { amount: money(amount) })}
            </p>
          </div>

          <div className='border-border/60 bg-muted/20 mt-1 w-full max-w-[300px] rounded-xl border px-4 py-3'>
            <div className='flex items-center justify-between text-sm'>
              <span className='text-muted-foreground'>
                {t('checkout.newBalanceLabel')}
              </span>
              <span className='font-semibold tabular-nums'>
                {money(liveBalance)}
              </span>
            </div>
            {!reflected && (
              <div className='text-muted-foreground/80 mt-2 flex items-center justify-center gap-1.5 text-[11px]'>
                <Loader2 className='h-3 w-3 animate-spin' />
                {t('checkout.syncing')}
              </div>
            )}
          </div>

          <Button
            onClick={onClose}
            className={cn(
              'mt-1 cursor-pointer font-semibold',
              'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black hover:brightness-110'
            )}
          >
            {t('checkout.done')}
          </Button>
        </div>
      }
    />
  );
}
