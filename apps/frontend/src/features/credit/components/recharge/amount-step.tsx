'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Progress } from '@ringee/frontend-shared/components/ui/progress';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { History, Wallet } from 'lucide-react';
import type { SavedPaymentMethod } from '@/features/credit/store/credit.store';
import {
  RECHARGE_PRESETS,
  MIN_AMOUNT,
  money,
  estimateMinutes,
  formatBrand
} from '../../lib/recharge';
import { SavedMethodCard } from './saved-method-card';

interface Props {
  amount: number;
  onAmountChange: (n: number) => void;
  currentBalance: number;
  lastTopupAmount: number | null;
  method: SavedPaymentMethod | null;
  /** Continue with the primary path (saved-card fast recharge, or checkout). */
  onPrimary: () => void;
  /** Switch to embedded checkout to use a different card (saved case only). */
  onUseAnotherMethod: () => void;
}

const primaryButtonClasses = cn(
  'w-full font-semibold transition-all duration-300',
  'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black',
  'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:scale-[1.02] hover:brightness-110'
);

/**
 * Compact amount selector — the fast, low-friction entry point. Answers only
 * "how much, and with what card": presets + custom amount, resulting balance
 * and calling time, a "last top-up" hint, and a single primary CTA that adapts
 * to whether a saved card is on file.
 */
export function AmountStep({
  amount,
  onAmountChange,
  currentBalance,
  lastTopupAmount,
  method,
  onPrimary,
  onUseAnotherMethod
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const belowMin = amount < MIN_AMOUNT;
  const newBalance = currentBalance + amount;
  const level = Math.min(100, (amount / 100) * 100);
  const hasSaved = !!method?.hasSavedMethod;

  // Highlight the last-used amount when it matches a preset, so returning users
  // can recharge the same amount in one tap.
  const recommended =
    lastTopupAmount &&
    (RECHARGE_PRESETS as readonly number[]).includes(lastTopupAmount)
      ? lastTopupAmount
      : null;

  return (
    <div className='space-y-4'>
      {/* Current balance */}
      <div className='text-muted-foreground flex items-center justify-between text-xs'>
        <span className='flex items-center gap-1.5'>
          <Wallet className='h-3.5 w-3.5' />
          {t('amount.currentBalance')}
        </span>
        <span className='text-foreground font-medium tabular-nums'>
          {money(currentBalance)}
        </span>
      </div>

      {/* Preset amounts */}
      <div>
        <Label className='text-muted-foreground mb-2 block text-xs font-medium tracking-wide uppercase'>
          {t('common.chooseAmount')}
        </Label>
        <div className='grid grid-cols-4 gap-2'>
          {RECHARGE_PRESETS.map((val) => (
            <Button
              key={val}
              variant={val === amount ? 'default' : 'outline'}
              onClick={() => onAmountChange(val)}
              className={cn(
                'relative cursor-pointer tabular-nums',
                val === amount
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm'
                  : 'hover:border-emerald-500 hover:text-emerald-400',
                val === recommended &&
                  val !== amount &&
                  'ring-1 ring-emerald-500/40'
              )}
            >
              ${val}
            </Button>
          ))}
        </div>
      </div>

      {/* Custom amount */}
      <div>
        <Label htmlFor='custom'>{t('common.customAmountLabel')}</Label>
        <Input
          id='custom'
          type='number'
          min={MIN_AMOUNT}
          placeholder={t('oneTime.customPlaceholder')}
          value={amount}
          onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
          aria-invalid={belowMin}
          className={cn(
            'mt-1 max-w-[150px]',
            belowMin && 'border-red-500 focus-visible:ring-red-500'
          )}
        />
        {belowMin && (
          <p className='mt-1 text-xs text-red-500'>
            {t('common.minAmountError', { amount: MIN_AMOUNT })}
          </p>
        )}
      </div>

      {/* Estimated new balance + calling time */}
      <div className='space-y-2 pt-1'>
        <div className='flex justify-between text-sm'>
          <span>{t('oneTime.newBalance')}</span>
          <span className='font-medium text-emerald-400 tabular-nums'>
            {money(newBalance)}
          </span>
        </div>
        <Progress value={level} className='bg-muted h-2 overflow-hidden' />
        <div className='text-muted-foreground flex items-center justify-between text-xs'>
          <span>
            {t('oneTime.estimatedTime', { minutes: estimateMinutes(amount) })}
          </span>
          {lastTopupAmount ? (
            <span className='flex items-center gap-1'>
              <History className='h-3 w-3' />
              {t('amount.lastTopup', { amount: money(lastTopupAmount) })}
            </span>
          ) : null}
        </div>
      </div>

      {/* Saved method + CTAs */}
      {hasSaved && method ? (
        <div className='space-y-2 pt-1'>
          <SavedMethodCard method={method} />
          <Button
            onClick={onPrimary}
            disabled={belowMin}
            size='lg'
            className={primaryButtonClasses}
          >
            {t('amount.rechargeCta', { amount: money(amount) })}
          </Button>
          <Button
            variant='ghost'
            onClick={onUseAnotherMethod}
            className='text-muted-foreground hover:text-foreground w-full cursor-pointer text-sm'
          >
            {t('amount.useAnotherMethod')}
          </Button>
          <p className='text-muted-foreground/70 text-center text-[11px]'>
            {method.brand
              ? t('amount.savedHint', {
                  brand: formatBrand(method.brand),
                  last4: method.last4 ?? '••••'
                })
              : t('checkout.creditsNote')}
          </p>
        </div>
      ) : (
        <Button
          onClick={onPrimary}
          disabled={belowMin}
          size='lg'
          className={primaryButtonClasses}
        >
          {t('amount.continueCheckout')}
        </Button>
      )}
    </div>
  );
}
