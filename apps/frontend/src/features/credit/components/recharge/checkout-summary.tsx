'use client';

import { Wallet, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { money, estimateMinutes } from '../../lib/recharge';

interface Props {
  /** Amount being added (USD). */
  amount: number;
  /** Balance before this top-up (USD). */
  currentBalance: number;
  className?: string;
  /** Stick to the top of the scroll container on wide layouts. */
  sticky?: boolean;
}

/**
 * The Ringee product-language framing around a payment: amount, resulting
 * balance, estimated calling time and the "credits added after confirmation"
 * note. Shared by the saved-card fast path and the embedded checkout so both
 * read as one billing experience.
 */
export function CheckoutSummary({
  amount,
  currentBalance,
  className,
  sticky
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const projected = currentBalance + amount;
  const minutes = estimateMinutes(amount);

  return (
    <aside
      className={cn(
        'border-border/60 bg-muted/20 self-start rounded-xl border p-4',
        sticky && '@[600px]:sticky @[600px]:top-0',
        className
      )}
    >
      <p className='text-muted-foreground text-[10px] font-medium tracking-[0.14em] uppercase'>
        {t('checkout.amountLabel')}
      </p>
      <p className='mt-1 text-3xl font-semibold tracking-tight tabular-nums'>
        {money(amount)}
      </p>

      <div className='border-border/50 my-4 border-t' />

      <dl className='space-y-3 text-sm'>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground flex items-center gap-1.5'>
            <Wallet className='h-3.5 w-3.5' />
            {t('checkout.newBalanceLabel')}
          </dt>
          <dd className='font-medium tabular-nums'>{money(projected)}</dd>
        </div>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground flex items-center gap-1.5'>
            <Clock className='h-3.5 w-3.5' />
            {t('checkout.estCallingTime')}
          </dt>
          <dd className='font-medium tabular-nums'>
            {t('checkout.minutesValue', { minutes: minutes.toLocaleString() })}
          </dd>
        </div>
      </dl>

      <p className='text-muted-foreground/80 border-border/50 mt-4 border-t pt-3 text-[11px] leading-relaxed'>
        {t('checkout.creditsNote')}
      </p>
    </aside>
  );
}
