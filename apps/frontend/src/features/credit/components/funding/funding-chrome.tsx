'use client';

import { ArrowLeft, ShieldCheck, Lock, BadgeCheck } from 'lucide-react';
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

interface ShellProps {
  title: string;
  subtitle?: string;
  /** Right-aligned pill (amount, cadence, etc.). */
  badge?: React.ReactNode;
  /** When set, renders the back affordance. */
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  hideFooter?: boolean;
  children: React.ReactNode;
}

/**
 * The takeover chrome: a sticky premium header (back · title + subtitle ·
 * badge), a single scroll region (so the Stripe form never scrolls inside its
 * own little box — the whole panel scrolls), and the shared footer. Bounds
 * itself with a max-height and scrolls internally, so it drops cleanly into the
 * content-fitting popover without assuming a fixed drawer height.
 */
export function FundingPanelShell({
  title,
  subtitle,
  badge,
  onBack,
  backLabel,
  backDisabled,
  hideFooter,
  children
}: ShellProps) {
  return (
    <div className='flex max-h-[85vh] min-h-0 flex-col sm:max-h-[80vh]'>
      <header className='border-border/60 bg-background/95 sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b px-5 py-4 backdrop-blur'>
        {onBack && (
          <button
            type='button'
            onClick={onBack}
            disabled={backDisabled}
            aria-label={backLabel ?? title}
            className={cn(
              'border-border/70 bg-muted/30 text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
              'hover:text-foreground hover:border-border cursor-pointer disabled:pointer-events-none disabled:opacity-40'
            )}
          >
            <ArrowLeft className='h-4 w-4' />
          </button>
        )}

        <div className='min-w-0 flex-1'>
          <p className='text-[15px] font-semibold tracking-tight'>{title}</p>
          {subtitle && (
            <p className='text-muted-foreground truncate text-xs'>{subtitle}</p>
          )}
        </div>

        {badge && (
          <div className='border-border/70 bg-muted/40 shrink-0 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums'>
            {badge}
          </div>
        )}
      </header>

      <div className='@container min-h-0 flex-1 overflow-y-auto'>
        {children}
      </div>

      {!hideFooter && <FundingFooter />}
    </div>
  );
}
