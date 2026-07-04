'use client';

import type { LucideIcon } from 'lucide-react';
import { ShieldCheck, Lock, BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { money } from '../../lib/recharge';

export interface SummaryRow {
  label: string;
  value: string;
  icon?: LucideIcon;
  /** Render the value in the accent color (positive balances, totals). */
  accent?: boolean;
}

interface Props {
  /** Small uppercase eyebrow above the headline amount. */
  label: string;
  amount: number;
  /** e.g. "/mo" appended to the headline for recurring flows. */
  suffix?: string;
  /** Pill describing the funding type (One-time / Monthly / Auto-reload). */
  fundingType?: string;
  rows: SummaryRow[];
  note?: string;
  /** Show the Secure-by-Stripe trust bullets (used in the wide left column). */
  confidence?: boolean;
  sticky?: boolean;
  className?: string;
}

/**
 * The Ringee product-language framing that sits to the LEFT of the payment
 * area in every funding takeover. One component, one visual system: a headline
 * amount, a funding-type pill, a set of rows (new balance, calling time,
 * frequency, threshold…), an honest note, and optional trust bullets. Shared by
 * one-time, monthly and auto-reload so they all read as one billing experience.
 */
export function FundingSummary({
  label,
  amount,
  suffix,
  fundingType,
  rows,
  note,
  confidence,
  sticky,
  className
}: Props) {
  const t = useTranslations('billing.credits.popover');

  return (
    <aside
      className={cn(
        'border-border/60 bg-muted/20 flex flex-col gap-4 self-start rounded-xl border p-5',
        sticky && '@[640px]:sticky @[640px]:top-4',
        className
      )}
    >
      <div>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-muted-foreground text-[10px] font-medium tracking-[0.14em] uppercase'>
            {label}
          </p>
          {fundingType && (
            <span className='border-border/60 bg-background text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium'>
              {fundingType}
            </span>
          )}
        </div>
        <p className='mt-1 text-3xl font-semibold tracking-tight tabular-nums'>
          {money(amount)}
          {suffix && (
            <span className='text-muted-foreground ml-1 text-base font-medium'>
              {suffix}
            </span>
          )}
        </p>
      </div>

      <div className='border-border/50 border-t' />

      <dl className='space-y-3 text-sm'>
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className='flex items-center justify-between gap-2'
            >
              <dt className='text-muted-foreground flex items-center gap-1.5'>
                {Icon && <Icon className='h-3.5 w-3.5' />}
                {row.label}
              </dt>
              <dd
                className={cn(
                  'font-medium tabular-nums',
                  row.accent && 'text-emerald-400'
                )}
              >
                {row.value}
              </dd>
            </div>
          );
        })}
      </dl>

      {note && (
        <p className='text-muted-foreground/80 border-border/50 border-t pt-3 text-[11px] leading-relaxed'>
          {note}
        </p>
      )}

      {confidence && (
        <ul className='text-muted-foreground/90 border-border/50 space-y-2 border-t pt-3 text-[11px]'>
          <li className='flex items-center gap-2'>
            <ShieldCheck className='h-3.5 w-3.5 shrink-0 text-emerald-400' />
            {t('footer.secureByStripe')}
          </li>
          <li className='flex items-center gap-2'>
            <Lock className='h-3.5 w-3.5 shrink-0' />
            {t('footer.cardSafety')}
          </li>
          <li className='flex items-center gap-2'>
            <BadgeCheck className='h-3.5 w-3.5 shrink-0' />
            {t('footer.creditsAfter')}
          </li>
        </ul>
      )}
    </aside>
  );
}
