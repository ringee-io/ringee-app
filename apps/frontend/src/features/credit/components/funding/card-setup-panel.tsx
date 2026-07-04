'use client';

import { useCallback } from 'react';
import { CheckCircle2, CreditCard, ShieldCheck, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { EmbeddedStripePanel } from './embedded-stripe-panel';
import { FundingSummary } from './funding-summary';

interface Props {
  /** Copy variant — who asked to change the card. */
  context: 'monthly' | 'auto-reload';
  onBack: () => void;
  /** Called after the new card is saved and the store is refreshed. */
  onDone: () => void;
}

/**
 * Save / replace the card WITHOUT charging it, via an embedded Stripe
 * `mode:"setup"` session. On completion the webhook promotes the new card to
 * the customer (and any active subscription) default and clears a failed
 * auto-reload; here we just refresh the store and confirm. No redirect.
 */
export function CardSetupPanel({ context, onBack, onDone }: Props) {
  const t = useTranslations('billing.credits.popover');
  const api = useApi();
  const fetchPaymentMethod = useCreditStore((s) => s.fetchPaymentMethod);
  const fetchMonthlyFund = useCreditStore((s) => s.fetchMonthlyFund);
  const fetchAutoReloadSettings = useCreditStore(
    (s) => s.fetchAutoReloadSettings
  );

  const createSession = useCallback(async () => {
    const res = await api.post('/stripe/setup/payment-method/embedded', {
      frontendOrigin: window.location.origin
    });
    return { clientSecret: res.clientSecret, sessionId: res.sessionId ?? null };
  }, [api]);

  const onComplete = useCallback(() => {
    // The webhook does the promotion; give it a beat, then refresh what the
    // drawer shows. These are silent, non-blocking refreshes.
    fetchPaymentMethod(api);
    fetchMonthlyFund(api);
    fetchAutoReloadSettings(api);
  }, [api, fetchPaymentMethod, fetchMonthlyFund, fetchAutoReloadSettings]);

  return (
    <EmbeddedStripePanel
      title={t('card.title')}
      subtitle={t('card.subtitle')}
      onBack={onBack}
      backLabel={t('card.title')}
      createSession={createSession}
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
          sticky
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
