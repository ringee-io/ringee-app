'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { money } from '../../lib/recharge';

interface Props {
  /** True once the webhook-credited balance is visible to us. */
  creditReflected: boolean;
  /** Balance we expect after crediting (baseline + amount). */
  projectedBalance: number;
  /** Current live balance from the store (used once credit is reflected). */
  liveBalance: number;
  onClose: () => void;
}

/**
 * Shared post-payment success state. Because crediting happens in the webhook
 * (which can lag a second or two), we show an honest "credits will appear
 * shortly" until the balance actually rises, then switch to "credits added".
 * Used by both the saved-card fast path and the embedded checkout.
 */
export function ResultView({
  creditReflected,
  projectedBalance,
  liveBalance,
  onClose
}: Props) {
  const t = useTranslations('billing.credits.popover');

  return (
    <div className='animate-in fade-in-0 zoom-in-95 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center duration-300'>
      <div className='flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-8 ring-emerald-500/20'>
        <CheckCircle2 className='h-7 w-7 text-emerald-400' />
      </div>
      <div className='space-y-1'>
        <p className='text-lg font-semibold tracking-tight'>
          {t('checkout.completedTitle')}
        </p>
        <p className='text-muted-foreground mx-auto max-w-[40ch] text-sm'>
          {creditReflected
            ? t('checkout.completedReflected')
            : t('checkout.completedPending')}
        </p>
      </div>

      <div className='border-border/60 bg-muted/20 mt-1 w-full max-w-[280px] rounded-xl border px-4 py-3'>
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>
            {t('checkout.newBalanceLabel')}
          </span>
          <span className='font-semibold tabular-nums'>
            {creditReflected ? money(liveBalance) : money(projectedBalance)}
          </span>
        </div>
        {!creditReflected && (
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
  );
}
