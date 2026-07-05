'use client';

import { ShieldCheck, Lock, BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';

/**
 * The premium footer shared by every funding takeover (and the hub). Three
 * honest trust signals — Secure by Stripe, card details never touch Ringee
 * servers, credits added after confirmation. Deliberately NO "refund
 * guarantee". Wraps cleanly on narrow / mobile widths.
 */
export function FundingFooter({ className }: { className?: string }) {
  const t = useTranslations('billing.credits.popover');
  return (
    <footer
      className={cn(
        'border-border/60 text-muted-foreground flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t px-5 py-3 text-[11px]',
        className
      )}
    >
      <span className='flex items-center gap-1.5'>
        <ShieldCheck className='h-3.5 w-3.5 text-emerald-400' />
        {t('footer.secureByStripe')}
      </span>
      <span className='bg-border/70 hidden h-3 w-px sm:inline-block' />
      <span className='flex items-center gap-1.5'>
        <Lock className='h-3.5 w-3.5' />
        {t('footer.cardSafety')}
      </span>
      <span className='bg-border/70 hidden h-3 w-px sm:inline-block' />
      <span className='flex items-center gap-1.5'>
        <BadgeCheck className='h-3.5 w-3.5' />
        {t('footer.creditsAfter')}
      </span>
    </footer>
  );
}
