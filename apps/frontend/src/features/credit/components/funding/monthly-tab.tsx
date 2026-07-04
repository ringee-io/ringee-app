'use client';

import { useCallback, useState } from 'react';
import { CalendarSync } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import {
  MIN_AMOUNT,
  MONTHLY_PRESETS,
  estimateMinutes
} from '../../lib/recharge';
import { MonthlyStatus } from './monthly-status';

interface Props {
  amount: number;
  onAmountChange: (n: number) => void;
  /** Enter the embedded subscription checkout takeover. */
  onSetup: () => void;
  /** Enter the card-setup takeover to change the card. */
  onChangeCard: () => void;
}

const ctaClasses = cn(
  'w-full font-semibold transition-all duration-300',
  'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black',
  'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:scale-[1.01] hover:brightness-110'
);

/**
 * Monthly funding tab. Active → the management view; inactive → an amount
 * picker gated behind an explicit consent to a recurring monthly charge (never
 * activated by accident). Setup itself happens in the embedded subscription
 * takeover; credits are added only when each invoice is paid (webhook).
 */
export function MonthlyTab({
  amount,
  onAmountChange,
  onSetup,
  onChangeCard
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const api = useApi();
  const monthlyFund = useCreditStore((s) => s.monthlyFund);
  const settings = useCreditStore((s) => s.autoReloadSettings);
  const fetchMonthlyFund = useCreditStore((s) => s.fetchMonthlyFund);
  const fetchAutoReloadSettings = useCreditStore(
    (s) => s.fetchAutoReloadSettings
  );

  const [consent, setConsent] = useState(false);
  const belowMin = amount < MIN_AMOUNT;
  const isActive =
    monthlyFund?.enabled || settings?.monthlyFundEnabled || false;

  const editAmount = useCallback(
    async (next: number) => {
      await api.patch('/credits/monthly-fund', { amount: next });
      await Promise.all([fetchMonthlyFund(api), fetchAutoReloadSettings(api)]);
    },
    [api, fetchMonthlyFund, fetchAutoReloadSettings]
  );

  const cancel = useCallback(async () => {
    await api.delete('/credits/monthly-fund');
    await Promise.all([fetchMonthlyFund(api), fetchAutoReloadSettings(api)]);
  }, [api, fetchMonthlyFund, fetchAutoReloadSettings]);

  if (isActive) {
    return (
      <MonthlyStatus
        amount={monthlyFund?.amount ?? settings?.monthlyFundAmount ?? null}
        nextChargeDate={monthlyFund?.nextChargeDate ?? null}
        paymentMethod={monthlyFund?.paymentMethod ?? null}
        onEditAmount={editAmount}
        onChangeCard={onChangeCard}
        onCancel={cancel}
      />
    );
  }

  return (
    <div className='mx-auto w-full max-w-md space-y-5'>
      <p className='text-muted-foreground text-sm'>{t('monthly.intro')}</p>

      <div>
        <Label className='text-muted-foreground mb-2 block text-xs font-medium tracking-wide uppercase'>
          {t('monthly.amountLabel')}
        </Label>
        <div className='grid grid-cols-4 gap-2'>
          {MONTHLY_PRESETS.map((val) => (
            <Button
              key={val}
              variant={val === amount ? 'default' : 'outline'}
              onClick={() => onAmountChange(val)}
              className={cn(
                'cursor-pointer tabular-nums',
                val === amount
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm'
                  : 'hover:border-emerald-500 hover:text-emerald-400'
              )}
            >
              ${val}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor='monthly-custom'>{t('common.customAmountLabel')}</Label>
        <Input
          id='monthly-custom'
          type='number'
          min={MIN_AMOUNT}
          placeholder={t('monthly.customPlaceholder')}
          value={amount}
          onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
          aria-invalid={belowMin}
          className={cn('mt-1 max-w-[160px]', belowMin && 'border-red-500')}
        />
        {belowMin && (
          <p className='mt-1 text-xs text-red-500'>
            {t('common.minAmountError', { amount: MIN_AMOUNT })}
          </p>
        )}
      </div>

      <div className='border-border/50 bg-muted/20 space-y-1.5 rounded-xl border p-4'>
        <div className='flex items-center justify-between text-sm'>
          <span className='flex items-center gap-1.5'>
            <CalendarSync className='text-muted-foreground h-3.5 w-3.5' />
            {t('monthly.monthlyCharge')}
          </span>
          <span className='font-semibold text-emerald-400 tabular-nums'>
            {t('monthly.monthlyChargeValue', { amount: amount.toFixed(2) })}
          </span>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('monthly.estimatedTime', { minutes: estimateMinutes(amount) })}
        </p>
      </div>

      {/* Explicit, required consent — monthly funding is never activated by
          accident. */}
      <label
        htmlFor='monthly-consent'
        className='border-border/60 bg-muted/20 flex cursor-pointer items-start gap-2.5 rounded-xl border p-3'
      >
        <Checkbox
          id='monthly-consent'
          checked={consent}
          onCheckedChange={(c) => setConsent(c === true)}
          className='mt-0.5'
        />
        <div className='space-y-0.5'>
          <span className='text-xs font-medium'>{t('monthly.consent')}</span>
          <p className='text-muted-foreground text-[11px] leading-snug'>
            {t('monthly.consentHint')}
          </p>
        </div>
      </label>

      <Button
        onClick={onSetup}
        disabled={belowMin || !consent}
        size='lg'
        className={ctaClasses}
      >
        {t('monthly.subscribe')}
      </Button>
    </div>
  );
}
