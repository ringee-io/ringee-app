'use client';

import { useState, useEffect } from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent
} from '@ringee/frontend-shared/components/ui/popover';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Zap, Plus } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useCongrats } from '@ringee/frontend-shared/hooks/use.congrats';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { useAuth } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useFundingFlow } from '@/features/credit/hooks/use-funding-flow';
import { FundingFlow } from './funding/funding-flow';

const triggerClasses = cn(
  'group relative flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 font-semibold',
  'text-white transition-all duration-300 ease-out',
  'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400',
  'shadow-[0_0_18px_-4px_rgba(45,212,191,0.6)]',
  'hover:shadow-[0_0_25px_-4px_rgba(45,212,191,0.8)]',
  'cursor-pointer'
);

const MyButton = ({ onClick }: { onClick?: () => void }) => {
  const t = useTranslations('billing.credits.popover');
  return (
    <Button
      variant='ghost'
      size='sm'
      onClick={onClick}
      className={triggerClasses}
    >
      <span className='absolute inset-0 rounded-full bg-white/10 opacity-0 blur-sm transition-opacity group-hover:opacity-100' />
      <div className='z-10 flex items-center gap-2'>
        <Zap className='text-foreground h-4 w-4 transition-transform group-hover:rotate-6' />
        <span className='text-foreground font-semibold'>
          {t('freeCallButton')}
        </span>
        <span className='text-foreground hidden text-sm opacity-90 sm:inline'>
          {t('freeCallSubtitle')}
        </span>
      </div>
    </Button>
  );
};

/**
 * The Ringee funding center (`FundingFlow`) in a compact, content-fitting
 * popover anchored to the `$balance` trigger. The popover grows to the big
 * two-column checkout while one of those steps is active. Public API is
 * unchanged (`children`, `fetch`, `useMock`).
 */
export function CreditPopover({
  children,
  fetch = true,
  useMock = false
}: {
  children?: React.ReactElement;
  fetch?: boolean;
  useMock?: boolean;
}) {
  const t = useTranslations('billing.credits.popover');
  const auth = useAuth();
  const api = useApi();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const flow = useFundingFlow();

  const { balance, freeCallTrial, fetchBalance, hasLoaded } = useCreditStore();

  // Close the whole popover AND drop any active step, so "Done" never leaves a
  // detached checkout mounted (the step used to render as a sibling dialog).
  const close = () => {
    setOpen(false);
    flow.reset();
  };

  // Initial load so the trigger shows the balance.
  useEffect(() => {
    if (fetch && (useMock || auth?.userId)) {
      fetchBalance(api, useMock);
      flow.refreshFunding(useMock);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.userId, fetch]);

  useCongrats();

  // Skeleton only until the FIRST successful balance load — background refreshes
  // (post-payment reconciliation) must never collapse the whole trigger.
  if (!hasLoaded) {
    return <Skeleton className='h-6 w-48' />;
  }

  if (freeCallTrial === true) {
    return <MyButton onClick={() => router.push('/dashboard/call')} />;
  }

  const handleOpenChange = (next: boolean) => {
    // Never discard an in-flight charge (built-in close, Esc, outside click all
    // route through here). Crediting is webhook-driven and idempotent, so a
    // normal close mid-flow is otherwise safe.
    if (!next && flow.paymentInFlight) return;
    setOpen(next);
    // Always land on the compact hub, so the width matches the step shown.
    flow.reset();
    if (next) {
      fetchBalance(api, useMock, true);
      flow.refreshFunding(useMock);
      flow.presetLastTopup();
    }
  };

  const trigger = children ?? (
    <Button variant='ghost' size='sm' className={triggerClasses}>
      <span className='absolute inset-0 rounded-full bg-white/10 opacity-0 blur-sm transition-opacity group-hover:opacity-100' />
      <div className='z-10 flex items-center gap-2'>
        <Zap className='text-foreground h-4 w-4 transition-transform group-hover:rotate-6' />
        <span className='text-foreground font-semibold'>
          ${balance.toFixed(2)}
        </span>
        <span className='text-foreground hidden text-sm opacity-90 sm:inline'>
          {t('availableCredit')}
        </span>
      </div>
      <div className='bg-foreground/20 z-10 ml-1 flex h-6 w-6 items-center justify-center rounded-full transition-transform group-hover:rotate-90'>
        <Plus className='text-foreground h-3.5 w-3.5' />
      </div>
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align='end'
        sideOffset={12}
        collisionPadding={12}
        onOpenAutoFocus={(e) => {
          // Don't yank focus into an active step (esp. the Stripe iframe).
          if (flow.flowStep) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // A live charge hard-blocks dismissal; any active step steps back
          // instead of closing; on the hub, let Radix close the popover.
          if (flow.paymentInFlight) e.preventDefault();
          else if (flow.flowStep) {
            e.preventDefault();
            flow.back();
          }
        }}
        onInteractOutside={(e) => {
          if (flow.blockOutside) e.preventDefault();
        }}
        className={cn(
          'bg-background text-foreground max-w-[calc(100vw-1.5rem)]',
          'overflow-hidden rounded-2xl border p-0 shadow-2xl',
          // The popover grows to the big two-column checkout, else stays compact.
          flow.wide ? 'w-[min(1240px,96vw)]' : 'w-[420px]'
        )}
      >
        <FundingFlow flow={flow} onClose={close} />
      </PopoverContent>
    </Popover>
  );
}
