'use client';

import { CreditCard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { SavedPaymentMethod } from '@/features/credit/store/credit.store';
import { formatBrand, formatExpiry } from '../../lib/recharge';

/**
 * Compact display of the customer's saved card: brand, masked number and
 * expiry. Display-only — no id or full card data ever reaches the client.
 */
export function SavedMethodCard({
  method,
  className
}: {
  method: SavedPaymentMethod;
  className?: string;
}) {
  const t = useTranslations('billing.credits.popover');
  const brand = formatBrand(method.brand);
  const exp = formatExpiry(method.expMonth, method.expYear);

  return (
    <div
      className={cn(
        'border-border/60 bg-muted/20 flex items-center gap-3 rounded-xl border p-3',
        className
      )}
    >
      <div className='border-border/70 bg-background flex h-9 w-12 shrink-0 items-center justify-center rounded-md border'>
        <CreditCard className='text-muted-foreground h-4 w-4' />
      </div>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium'>
          {brand}{' '}
          <span className='text-muted-foreground'>
            •••• {method.last4 ?? '••••'}
          </span>
        </p>
        {exp && (
          <p className='text-muted-foreground text-xs'>
            {t('saved.expLabel', { value: exp })}
          </p>
        )}
      </div>
    </div>
  );
}
