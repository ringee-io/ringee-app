'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Popover,
  PopoverTrigger,
  PopoverContent
} from '@ringee/frontend-shared/components/ui/popover';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { CreditCard, Zap, Plus, RefreshCw, CalendarSync } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useCongrats } from '@ringee/frontend-shared/hooks/use.congrats';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { useAuth } from '@clerk/nextjs';
import { useOnboardingComplete } from '@/features/onboarding/hooks/use.onboarding.complete';
import { useTranslations } from 'next-intl';
import { MIN_AMOUNT } from '../lib/recharge';
import { AmountStep } from './recharge/amount-step';
import { SavedRechargeStep } from './recharge/saved-recharge-step';
import { OneTimeCheckout } from './funding/one-time-checkout';
import { MonthlyTab } from './funding/monthly-tab';
import { MonthlySetupPanel } from './funding/monthly-setup-panel';
import { AutoReloadTab } from './funding/auto-reload-tab';
import { CardSetupPanel } from './funding/card-setup-panel';
import { FundingFooter } from './funding/funding-chrome';

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

// The full-panel takeovers that replace the hub (tab selector) while active.
type FlowStep =
  | null
  | 'one-time-saved'
  | 'one-time-checkout'
  | 'monthly-setup'
  | 'monthly-change-card'
  | 'auto-reload-change-card';

// The steps that host a Stripe iframe. Clicking inside the iframe reads as an
// "interact outside" to Radix, so we must not auto-close the popover on those.
const EMBEDDED_STEPS: FlowStep[] = [
  'one-time-checkout',
  'monthly-setup',
  'monthly-change-card',
  'auto-reload-change-card'
];

/**
 * Smoothly animate a container to the exact height of its current child. The
 * returned `measureRef` is attached to whichever step is mounted; a
 * ResizeObserver keeps the measured height in sync even as async content (the
 * Stripe iframe) grows. Reads run at commit time so the first paint is correct
 * — no open-time height jump.
 */
function useAutoHeight() {
  const [height, setHeight] = useState<number>();
  const observerRef = useRef<ResizeObserver | null>(null);

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;
    const sync = () => setHeight(node.offsetHeight);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { height, measureRef };
}

// Directional step slide — forward (into a flow) enters from the right, back
// returns from the left. Height is animated separately, so this only moves x.
const stepVariants = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 26 }),
  animate: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -26 })
};

/**
 * The Ringee funding center. A compact, content-fitting popover anchored to the
 * `$balance` trigger that hosts three first-class flows — One-time, Monthly and
 * Auto-reload — in one visual system. The panel springs to the exact height of
 * whatever step is showing (amount picker → saved-card one-tap recharge →
 * embedded Stripe checkout), so recharging is fast and never feels like a full
 * page. Public API is unchanged (`children`, `fetch`, `useMock`).
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
  const [tab, setTab] = useState<'one-time' | 'monthly' | 'auto-reload'>(
    'one-time'
  );
  const [flowStep, setFlowStep] = useState<FlowStep>(null);
  const [dir, setDir] = useState(1);
  const [paymentInFlight, setPaymentInFlight] = useState(false);

  const { height, measureRef } = useAutoHeight();

  // Primary inputs are lifted here so "back" from any takeover preserves them.
  const [amount, setAmount] = useState(25);
  const [monthlyAmount, setMonthlyAmount] = useState(50);
  const [threshold, setThreshold] = useState(10);
  const [reloadAmount, setReloadAmount] = useState(25);

  const {
    balance,
    freeCallTrial,
    fetchBalance,
    fetchAutoReloadSettings,
    fetchMonthlyFund,
    fetchPaymentMethod,
    paymentMethod,
    lastTopupAmount,
    hasLoaded
  } = useCreditStore();
  const { completeStep: completeOnboardingStep } = useOnboardingComplete();

  const takeover = flowStep !== null;
  const embeddedStep = EMBEDDED_STEPS.includes(flowStep);
  // Never let an outside click discard a live charge or a hosted card form.
  const blockOutside = paymentInFlight || embeddedStep;

  // Forward into a flow (slide left→right); `back` reverses it.
  const goTo = (step: Exclude<FlowStep, null>) => {
    setDir(1);
    setFlowStep(step);
  };
  const back = () => {
    setDir(-1);
    setFlowStep(null);
  };
  const close = () => setOpen(false);

  const proceedOneTime = () => {
    completeOnboardingStep('buy_credits');
    goTo(
      paymentMethod?.hasSavedMethod ? 'one-time-saved' : 'one-time-checkout'
    );
  };

  const useAnotherMethod = () => {
    completeOnboardingStep('buy_credits');
    goTo('one-time-checkout');
  };

  const refreshFunding = () => {
    if (useMock) return;
    fetchAutoReloadSettings(api);
    fetchMonthlyFund(api);
    fetchPaymentMethod(api);
  };

  // Initial load so the trigger shows the balance.
  useEffect(() => {
    if (fetch && (useMock || auth?.userId)) {
      fetchBalance(api, useMock);
      refreshFunding();
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
    if (!next && paymentInFlight) return;
    setOpen(next);
    if (next) {
      setDir(1);
      setFlowStep(null);
      fetchBalance(api, useMock, true);
      refreshFunding();
      const last = useCreditStore.getState().lastTopupAmount;
      if (last && last >= MIN_AMOUNT) setAmount(last);
    } else {
      setFlowStep(null);
      setTab('one-time');
    }
  };

  const renderTakeover = () => {
    switch (flowStep) {
      case 'one-time-saved':
        return paymentMethod ? (
          <SavedRechargeStep
            amount={amount}
            method={paymentMethod}
            currentBalance={balance}
            onBack={back}
            onChangeMethod={() => goTo('one-time-checkout')}
            onClose={close}
            onBusyChange={setPaymentInFlight}
          />
        ) : null;
      case 'one-time-checkout':
        return (
          <OneTimeCheckout
            amount={amount}
            currentBalance={balance}
            onBack={back}
            onClose={close}
          />
        );
      case 'monthly-setup':
        return (
          <MonthlySetupPanel
            amount={monthlyAmount}
            onBack={back}
            onClose={close}
          />
        );
      case 'monthly-change-card':
        return <CardSetupPanel context='monthly' onBack={back} onDone={back} />;
      case 'auto-reload-change-card':
        return (
          <CardSetupPanel context='auto-reload' onBack={back} onDone={back} />
        );
      default:
        return null;
    }
  };

  const renderHub = () => (
    // Self-bounded: caps its own height and scrolls the tab body internally, so
    // the popover only ever grows to the content, never past the viewport.
    <div className='flex max-h-[85vh] flex-col sm:max-h-[80vh]'>
      {/* Header — title + live balance chip */}
      <div className='flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3'>
        <div className='min-w-0'>
          <h3 className='flex items-center gap-2 text-[15px] font-semibold tracking-tight'>
            <CreditCard className='h-4 w-4 text-emerald-400' />
            {t('header')}
          </h3>
          <p className='text-muted-foreground text-xs'>{t('subheader')}</p>
        </div>
        <div className='border-border/60 bg-muted/30 shrink-0 rounded-xl border px-3 py-1.5 text-right'>
          <p className='text-muted-foreground text-[9px] font-medium tracking-[0.12em] uppercase'>
            {t('availableCredit')}
          </p>
          <p className='text-sm font-semibold tabular-nums'>
            ${balance.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Flow selector */}
      <div className='shrink-0 px-5'>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className='bg-muted/40 w-full'>
            <TabsTrigger value='one-time' className='flex-1 text-xs'>
              <CreditCard className='mr-1 h-3 w-3' />
              {t('tabs.oneTime')}
            </TabsTrigger>
            <TabsTrigger value='monthly' className='flex-1 text-xs'>
              <CalendarSync className='mr-1 h-3 w-3' />
              {t('tabs.monthly')}
            </TabsTrigger>
            <TabsTrigger value='auto-reload' className='flex-1 text-xs'>
              <RefreshCw className='mr-1 h-3 w-3' />
              {t('tabs.autoReload')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Active flow — crossfades on tab change; height is animated by the shell */}
      <div className='min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-4 pb-5'>
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {tab === 'one-time' && (
            <AmountStep
              amount={amount}
              onAmountChange={setAmount}
              currentBalance={balance}
              lastTopupAmount={lastTopupAmount}
              method={paymentMethod}
              onPrimary={proceedOneTime}
              onUseAnotherMethod={useAnotherMethod}
            />
          )}
          {tab === 'monthly' && (
            <MonthlyTab
              amount={monthlyAmount}
              onAmountChange={setMonthlyAmount}
              onSetup={() => goTo('monthly-setup')}
              onChangeCard={() => goTo('monthly-change-card')}
            />
          )}
          {tab === 'auto-reload' && (
            <AutoReloadTab
              threshold={threshold}
              onThresholdChange={setThreshold}
              reloadAmount={reloadAmount}
              onReloadChange={setReloadAmount}
              currentBalance={balance}
              onNeedCard={() => goTo('auto-reload-change-card')}
            />
          )}
        </motion.div>
      </div>

      <FundingFooter />
    </div>
  );

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
        // Focus the panel, not the (auto-loading) Stripe iframe.
        onOpenAutoFocus={(e) => {
          if (takeover) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (paymentInFlight) e.preventDefault();
          else if (takeover) {
            e.preventDefault();
            back();
          }
        }}
        onInteractOutside={(e) => {
          if (blockOutside) e.preventDefault();
        }}
        className={cn(
          'bg-background text-foreground w-[420px] max-w-[calc(100vw-1.5rem)]',
          'overflow-hidden rounded-2xl border p-0 shadow-2xl'
        )}
      >
        <motion.div
          initial={false}
          animate={{ height: height ?? 'auto' }}
          transition={{
            type: 'spring',
            stiffness: 340,
            damping: 34,
            mass: 0.9
          }}
          style={{ overflow: 'hidden' }}
        >
          <AnimatePresence mode='wait' initial={false} custom={dir}>
            <motion.div
              key={flowStep ?? 'hub'}
              ref={measureRef}
              custom={dir}
              variants={stepVariants}
              initial='initial'
              animate='animate'
              exit='exit'
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            >
              {takeover ? renderTakeover() : renderHub()}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}
