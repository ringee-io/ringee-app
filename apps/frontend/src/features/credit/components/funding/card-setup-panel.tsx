'use client';

import { useCallback } from 'react';
import { CheckCircle2, CreditCard, ShieldCheck, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import {
  ElementsCheckoutPanel,
  type CreatedIntent
} from './elements-checkout-panel';
import { FundingSummary } from './funding-summary';

interface Props {
  /** Copy variant — who asked to change the card. */
  context: 'monthly' | 'auto-reload';
  onBack: () => void;
  /** Called after the new card is saved and the store is refreshed. */
  onDone: () => void;
  /** Bubble the charge-in-flight state up so the popover blocks dismissal. */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Save / replace the card WITHOUT charging it, via a custom Stripe Elements
 * SetupIntent. On completion the `setup_intent.succeeded` webhook promotes the
 * new card to the customer (and any active subscription) default and clears a
 * failed auto-reload; here we just refresh the store and confirm. No redirect,
 * no invoice — so the billing-email field is intentionally hidden.
 */
export function CardSetupPanel({
  context,
  onBack,
  onDone,
  onBusyChange
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const api = useApi();
  const fetchPaymentMethod = useCreditStore((s) => s.fetchPaymentMethod);
  const fetchMonthlyFund = useCreditStore((s) => s.fetchMonthlyFund);
  const fetchAutoReloadSettings = useCreditStore(
    (s) => s.fetchAutoReloadSettings
  );

  const createIntent = useCallback(async (): Promise<CreatedIntent> => {
    const res = await api.post('/stripe/setup/payment-method/intent', {});
    return {
      clientSecret: res.clientSecret,
      intentId: res.setupIntentId ?? null,
      billingEmail: null
    };
  }, [api]);

  const onComplete = useCallback(() => {
    // The webhook does the promotion; give it a beat, then refresh what the
    // dialog shows. These are silent, non-blocking refreshes.
    fetchPaymentMethod(api);
    fetchMonthlyFund(api);
    fetchAutoReloadSettings(api);
  }, [api, fetchPaymentMethod, fetchMonthlyFund, fetchAutoReloadSettings]);

  return (
    <ElementsCheckoutPanel
      title={t('card.title')}
      subtitle={t('card.subtitle')}
      onBack={onBack}
      onClose={onDone}
      onBusyChange={onBusyChange}
      backLabel={t('card.title')}
      createIntent={createIntent}
      intentKind='setup'
      submitLabel={t('card.saveCta')}
      summary={
        <FundingSummary
          label={t('card.summaryLabel')}
          amount={0}
          fundingType={
            context === 'monthly' ? t('tabs.monthly') : t('tabs.autoReload')
          }
          rows={[]}
          note={t('card.note')}
          confidence
        />
      }
      onComplete={onComplete}
      result={
        <div className='animate-in fade-in-0 zoom-in-95 flex flex-col items-center justify-center gap-4 px-6 py-20 text-center duration-300'>
          <div className='flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-8 ring-emerald-500/20'>
            <CheckCircle2 className='h-7 w-7 text-emerald-400' />
          </div>
          <div className='space-y-1'>
            <p className='text-lg font-semibold tracking-tight'>
              {t('card.doneTitle')}
            </p>
            <p className='text-muted-foreground mx-auto max-w-[40ch] text-sm'>
              {t('card.doneBody')}
            </p>
          </div>
          <div className='text-muted-foreground/80 flex items-center gap-3 text-[11px]'>
            <span className='flex items-center gap-1.5'>
              <ShieldCheck className='h-3.5 w-3.5 text-emerald-400' />
              {t('footer.secureByStripe')}
            </span>
            <span className='flex items-center gap-1.5'>
              <Lock className='h-3.5 w-3.5' />
              {t('footer.cardSafety')}
            </span>
          </div>
          <Button
            onClick={onDone}
            className={cn(
              'mt-1 cursor-pointer font-semibold',
              'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black hover:brightness-110'
            )}
          >
            <CreditCard className='mr-1.5 h-4 w-4' />
            {t('card.doneCta')}
          </Button>
        </div>
      }
    />
  );
}
