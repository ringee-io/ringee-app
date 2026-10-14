'use client';

import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, Loader2, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { FundingFlow } from '@/features/credit/components/funding/funding-flow';
import {
  useFundingFlow,
  type FundingFlowState
} from '@/features/credit/hooks/use-funding-flow';
import { useCreditStore } from '@/features/credit/store/credit.store';

type BillingTab = 'credit' | 'subscriptions';

const triggerClasses = cn(
  'h-10 w-full flex-none justify-start gap-2.5 rounded-xl px-3',
  'text-muted-foreground hover:text-foreground dark:text-muted-foreground',
  'data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none',
  'dark:data-[state=active]:bg-muted dark:data-[state=active]:border-transparent'
);

/**
 * The billing screen: a floating vertical tab list with "Buy credit" (the
 * funding center inline, the default) and "Manage subscriptions" (a button to
 * the Stripe billing portal, opened only when clicked).
 */
export function BillingOverview() {
  const t = useTranslations('billing.overview');
  const flow = useFundingFlow();
  const [tab, setTab] = useState<BillingTab>('credit');

  const changeTab = (next: string) => {
    // Never unmount a checkout while a charge is in flight.
    if (flow.paymentInFlight) return;
    flow.reset();
    setTab(next as BillingTab);
  };

  return (
    <Tabs
      value={tab}
      onValueChange={changeTab}
      orientation='vertical'
      className='gap-6 md:flex-row md:items-start'
    >
      <TabsList className='bg-card h-auto w-full flex-col gap-1 rounded-2xl border p-1.5 shadow-sm md:sticky md:top-0 md:w-60 md:shrink-0'>
        <TabsTrigger value='credit' className={triggerClasses}>
          <Wallet />
          {t('buyCreditTab')}
        </TabsTrigger>
        <TabsTrigger value='subscriptions' className={triggerClasses}>
          <CreditCard />
          {t('subscriptionsTab')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value='credit' className='min-w-0'>
        <BuyCredit flow={flow} />
      </TabsContent>
      <TabsContent value='subscriptions' className='min-w-0'>
        <ManageSubscriptions />
      </TabsContent>
    </Tabs>
  );
}

function BuyCredit({ flow }: { flow: FundingFlowState }) {
  const api = useApi();
  const hasLoaded = useCreditStore((s) => s.hasLoaded);
  const { refreshFunding, presetLastTopup } = flow;

  // What opening the header's popover does: a fresh balance and funding state.
  // The header's own CreditPopover does the first balance load.
  useEffect(() => {
    useCreditStore.getState().fetchBalance(api, false, true);
    refreshFunding();
  }, [api, refreshFunding]);

  useEffect(() => {
    if (hasLoaded) presetLastTopup();
  }, [hasLoaded, presetLastTopup]);

  if (!hasLoaded) {
    return <Skeleton className='h-[460px] w-full max-w-[440px] rounded-2xl' />;
  }

  return (
    <div
      className={cn(
        'bg-background overflow-hidden rounded-2xl border shadow-sm',
        // The two-column checkout steps take the whole column.
        flow.wide ? 'w-full' : 'w-full max-w-[440px]'
      )}
    >
      <FundingFlow flow={flow} onClose={flow.reset} />
    </div>
  );
}

function ManageSubscriptions() {
  const api = useApi();
  const t = useTranslations('billing.overview');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(false);

  // Coming back from Stripe with the browser's back button can restore this
  // page from the back-forward cache with the button still spinning.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setOpening(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const openPortal = async () => {
    setOpening(true);
    setError(false);
    try {
      const { url } = await api.post<{ url: string }>('/stripe/billing/portal');
      window.location.assign(url);
    } catch {
      setOpening(false);
      setError(true);
    }
  };

  return (
    <div className='bg-background w-full max-w-[440px] rounded-2xl border p-6 shadow-sm'>
      <h3 className='text-[15px] font-semibold tracking-tight'>
        {t('subscriptionsTitle')}
      </h3>
      <p className='text-muted-foreground mt-1 text-sm'>
        {t('subscriptionsHint')}
      </p>
      <Button
        className='mt-6 w-full gap-2'
        disabled={opening}
        onClick={() => void openPortal()}
      >
        {opening ? (
          <Loader2 className='size-4 animate-spin' />
        ) : (
          <ExternalLink className='size-4' />
        )}
        {t('openStripe')}
      </Button>
      {error && (
        <p role='alert' className='text-destructive mt-3 text-sm'>
          {t('portalError')}
        </p>
      )}
    </div>
  );
}
