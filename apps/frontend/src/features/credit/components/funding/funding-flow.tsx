'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarSync, CreditCard, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Tabs,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { useCreditStore } from '@/features/credit/store/credit.store';
import type { FundingFlowState } from '@/features/credit/hooks/use-funding-flow';
import { useOnboardingComplete } from '@/features/onboarding/hooks/use.onboarding.complete';
import { AmountStep } from '../recharge/amount-step';
import { SavedRechargeStep } from '../recharge/saved-recharge-step';
import { OneTimeCheckout } from './one-time-checkout';
import { MonthlyTab } from './monthly-tab';
import { MonthlySetupPanel } from './monthly-setup-panel';
import { AutoReloadTab } from './auto-reload-tab';
import { CardSetupPanel } from './card-setup-panel';
import { FundingFooter } from './funding-chrome';

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
 * The Ringee funding center: three first-class flows — One-time, Monthly and
 * Auto-reload — in one visual system. The panel springs to the exact height of
 * whatever step is showing (amount picker → saved-card one-tap recharge →
 * embedded Stripe checkout), so recharging is fast and never feels like a full
 * page. Hosted by the header's CreditPopover and by the billing page; the host
 * owns the state (`useFundingFlow`) and decides what `onClose` ("Done") means.
 */
export function FundingFlow({
  flow,
  onClose
}: {
  flow: FundingFlowState;
  onClose: () => void;
}) {
  const t = useTranslations('billing.credits.popover');
  const { height, measureRef } = useAutoHeight();
  const { balance, paymentMethod, lastTopupAmount } = useCreditStore();
  const { completeStep: completeOnboardingStep } = useOnboardingComplete();

  const proceedOneTime = () => {
    completeOnboardingStep('buy_credits');
    flow.goTo(
      paymentMethod?.hasSavedMethod ? 'one-time-saved' : 'one-time-checkout'
    );
  };

  const useAnotherMethod = () => {
    completeOnboardingStep('buy_credits');
    flow.goTo('one-time-checkout');
  };

  // The compact saved-card fast path — the one step that keeps the panel
  // narrow. "Use another card" hands off to the wider one-time checkout step.
  const renderTakeover = () =>
    paymentMethod ? (
      <SavedRechargeStep
        amount={flow.amount}
        method={paymentMethod}
        currentBalance={balance}
        onBack={flow.back}
        onChangeMethod={() => flow.goTo('one-time-checkout')}
        onClose={onClose}
        onBusyChange={flow.setPaymentInFlight}
      />
    ) : null;

  const renderHub = () => (
    // Self-bounded: caps its own height and scrolls the tab body internally, so
    // the panel only ever grows to the content, never past the viewport.
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
        <Tabs
          value={flow.tab}
          onValueChange={(v) => flow.setTab(v as typeof flow.tab)}
        >
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
          key={flow.tab}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {flow.tab === 'one-time' && (
            <AmountStep
              amount={flow.amount}
              onAmountChange={flow.setAmount}
              currentBalance={balance}
              lastTopupAmount={lastTopupAmount}
              method={paymentMethod}
              onPrimary={proceedOneTime}
              onUseAnotherMethod={useAnotherMethod}
            />
          )}
          {flow.tab === 'monthly' && (
            <MonthlyTab
              amount={flow.monthlyAmount}
              onAmountChange={flow.setMonthlyAmount}
              onSetup={() => flow.goTo('monthly-setup')}
              onChangeCard={() => flow.goTo('monthly-change-card')}
            />
          )}
          {flow.tab === 'auto-reload' && (
            <AutoReloadTab
              threshold={flow.threshold}
              onThresholdChange={flow.setThreshold}
              reloadAmount={flow.reloadAmount}
              onReloadChange={flow.setReloadAmount}
              currentBalance={balance}
              onNeedCard={() => flow.goTo('auto-reload-change-card')}
            />
          )}
        </motion.div>
      </div>

      <FundingFooter />
    </div>
  );

  // Whatever step is active renders inside the panel (the shell animates its
  // height, the host its width).
  const renderStep = () => {
    switch (flow.flowStep) {
      case 'one-time-saved':
        return renderTakeover();
      case 'one-time-checkout':
        return (
          <OneTimeCheckout
            amount={flow.amount}
            currentBalance={balance}
            onBack={flow.back}
            onClose={onClose}
            onBusyChange={flow.setPaymentInFlight}
          />
        );
      case 'monthly-setup':
        return (
          <MonthlySetupPanel
            amount={flow.monthlyAmount}
            onBack={flow.back}
            onClose={onClose}
            onBusyChange={flow.setPaymentInFlight}
          />
        );
      case 'monthly-change-card':
        return (
          <CardSetupPanel
            context='monthly'
            onBack={flow.back}
            onDone={flow.back}
            onBusyChange={flow.setPaymentInFlight}
          />
        );
      case 'auto-reload-change-card':
        return (
          <CardSetupPanel
            context='auto-reload'
            onBack={flow.back}
            onDone={flow.back}
            onBusyChange={flow.setPaymentInFlight}
          />
        );
      default:
        return renderHub();
    }
  };

  return (
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
      <AnimatePresence
        mode='wait'
        initial={false}
        custom={flow.dir}
        // Resize once the old step has fully left and before the new one
        // enters, so a step never reflows mid-animation (2-col ↔ 1-col).
        onExitComplete={() => flow.setWide(flow.checkoutStep)}
      >
        <motion.div
          key={flow.flowStep ?? 'hub'}
          ref={measureRef}
          custom={flow.dir}
          variants={stepVariants}
          initial='initial'
          animate='animate'
          exit='exit'
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
