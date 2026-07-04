'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { SavedPaymentMethod } from '@/features/credit/store/credit.store';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { useSavedRecharge } from '../../hooks/use-saved-recharge';
import { money } from '../../lib/recharge';
import { CheckoutSummary } from './checkout-summary';
import { SavedMethodCard } from './saved-method-card';
import { ResultView } from './result-view';

interface Props {
  amount: number;
  method: SavedPaymentMethod;
  currentBalance: number;
  /** Back to amount selection. */
  onBack: () => void;
  /** Switch to embedded checkout (new / different card). */
  onChangeMethod: () => void;
  /** Close the whole popover. */
  onClose: () => void;
  /** Report charge-in-flight so the drawer can hard-guard accidental close. */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * The one-click fast path: review the exact charge against a saved card and
 * recharge with a single button. Handles server-side charging, in-place 3-D
 * Secure, the webhook-pending success state, and a decline fallback to a
 * different card — all without leaving the dashboard.
 */
export function SavedRechargeStep({
  amount,
  method,
  currentBalance,
  onBack,
  onChangeMethod,
  onClose,
  onBusyChange
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const liveBalance = useCreditStore((s) => s.balance);
  const { phase, creditReflected, start, reset } = useSavedRecharge();

  const busy = phase === 'processing' || phase === 'authenticating';
  const projectedBalance = currentBalance + amount;

  // Let the drawer hard-guard close while a charge is actually in flight.
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  return (
    <div className='bg-background flex max-h-[85vh] flex-col sm:max-h-[82vh]'>
      {/* Header */}
      <header className='border-border/60 flex shrink-0 items-center gap-3 border-b px-5 py-4'>
        <button
          type='button'
          onClick={onBack}
          disabled={busy || phase === 'succeeded'}
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
            {t('saved.title')}
          </p>
          <p className='text-muted-foreground truncate text-xs'>
            {t('saved.subtitle', { amount: money(amount) })}
          </p>
        </div>

        <div className='border-border/70 bg-muted/40 shrink-0 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums'>
          {money(amount)}
        </div>
      </header>

      {/* Body */}
      <div className='@container min-h-0 flex-1 overflow-y-auto'>
        {phase === 'succeeded' ? (
          <ResultView
            creditReflected={creditReflected}
            projectedBalance={projectedBalance}
            liveBalance={liveBalance}
            onClose={onClose}
          />
        ) : phase === 'failed' ? (
          <div className='flex flex-col items-center justify-center gap-3 px-6 py-16 text-center'>
            <div className='flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10'>
              <AlertTriangle className='h-5 w-5 text-red-400' />
            </div>
            <p className='text-sm font-medium'>{t('saved.failedTitle')}</p>
            <p className='text-muted-foreground max-w-[38ch] text-xs'>
              {t('saved.failedBody')}
            </p>
            <div className='mt-1 flex flex-col items-center gap-2'>
              <Button
                onClick={onChangeMethod}
                className={cn(
                  'cursor-pointer font-semibold',
                  'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black hover:brightness-110'
                )}
              >
                {t('saved.useAnotherMethod')}
              </Button>
              <Button
                variant='ghost'
                size='sm'
                onClick={reset}
                className='text-muted-foreground hover:text-foreground cursor-pointer'
              >
                {t('saved.tryAgain')}
              </Button>
            </div>
          </div>
        ) : (
          <div className='animate-in fade-in-0 grid grid-cols-1 gap-4 p-4 duration-300 @[600px]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] @[600px]:gap-5 @[600px]:p-5'>
            <CheckoutSummary
              amount={amount}
              currentBalance={currentBalance}
              sticky
            />

            <div className='flex min-w-0 flex-col gap-4'>
              <div>
                <p className='text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.14em] uppercase'>
                  {t('saved.methodLabel')}
                </p>
                <SavedMethodCard method={method} />
              </div>

              <div className='mt-auto space-y-2'>
                <Button
                  onClick={() => start(amount)}
                  disabled={busy}
                  size='lg'
                  className={cn(
                    'w-full font-semibold transition-all duration-300',
                    'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black',
                    'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:brightness-110'
                  )}
                >
                  {busy ? (
                    <span className='flex items-center gap-2'>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      {phase === 'authenticating'
                        ? t('saved.authenticating')
                        : t('saved.processing')}
                    </span>
                  ) : (
                    t('amount.rechargeCta', { amount: money(amount) })
                  )}
                </Button>
                <p className='text-muted-foreground/80 text-center text-[11px] leading-relaxed'>
                  {t('saved.chargeNote')}
                  <br />
                  {t('checkout.creditsNote')}
                </p>
                <Button
                  variant='ghost'
                  onClick={onChangeMethod}
                  disabled={busy}
                  className='text-muted-foreground hover:text-foreground w-full cursor-pointer text-sm'
                >
                  {t('amount.useAnotherMethod')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {phase !== 'succeeded' && (
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
