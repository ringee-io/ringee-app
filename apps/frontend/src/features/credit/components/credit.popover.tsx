'use client';

import { useState, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Progress } from '@ringee/frontend-shared/components/ui/progress';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from '@ringee/frontend-shared/components/ui/tabs';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import {
  CreditCard,
  Zap,
  Plus,
  ShieldCheck,
  DollarSign,
  RefreshCw,
  CalendarSync
} from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useCongrats } from '@ringee/frontend-shared/hooks/use.congrats';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { useAuth } from '@clerk/nextjs';
import { useOnboardingComplete } from '@/features/onboarding/hooks/use.onboarding.complete';

const PRESETS = [10, 25, 50, 100];

const MyButton = ({
  freeCallTrial,
  balance,
  onClick
}: {
  freeCallTrial: boolean;
  balance: number;
  onClick?: () => void;
}) => {
  return (
    <Button
      variant='ghost'
      size='sm'
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 font-semibold',
        'text-white transition-all duration-300 ease-out',
        'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400',
        'shadow-[0_0_18px_-4px_rgba(45,212,191,0.6)]',
        'hover:shadow-[0_0_25px_-4px_rgba(45,212,191,0.8)]',
        'cursor-pointer'
      )}
    >
      <span className='absolute inset-0 rounded-full bg-white/10 opacity-0 blur-sm transition-opacity group-hover:opacity-100' />

      <div className='z-10 flex items-center gap-2'>
        <Zap className='text-foreground h-4 w-4 transition-transform group-hover:rotate-6' />
        <span className='text-foreground font-semibold'>Call for free</span>
        <span className='text-foreground hidden text-sm opacity-90 sm:inline'>
          1 minute on us
        </span>
      </div>
    </Button>
  );
};

// --- One-time recharge tab ---
function OneTimeTab({
  onCheckout,
  loading
}: {
  onCheckout: (amount: number) => void;
  loading: boolean;
}) {
  const [amount, setAmount] = useState(25);
  const estimatedMinutes = Math.round(amount * 50);
  const level = Math.min(100, (amount / 100) * 100);

  return (
    <div className='space-y-4'>
      <div>
        <Label className='mb-2 block text-sm'>Choose amount</Label>
        <div className='flex flex-wrap gap-2'>
          {PRESETS.map((val) => (
            <Button
              key={val}
              variant={val === amount ? 'default' : 'outline'}
              onClick={() => setAmount(val)}
              className={cn(
                'min-w-[70px] flex-1 cursor-pointer',
                val === amount
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm'
                  : 'hover:border-emerald-500 hover:text-emerald-400'
              )}
            >
              ${val}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor='custom'>Or enter custom amount</Label>
        <Input
          id='custom'
          type='number'
          min={5}
          placeholder='e.g. 40'
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          className='mt-1 max-w-[150px]'
        />
      </div>

      <div className='space-y-2 pt-1'>
        <div className='flex justify-between text-sm'>
          <span>New balance</span>
          <span className='font-medium text-emerald-400'>
            ${amount.toFixed(2)}
          </span>
        </div>
        <Progress value={level} className='bg-muted h-2 overflow-hidden' />
        <p className='text-muted-foreground text-xs'>
          Estimated calling time: <strong>{estimatedMinutes}</strong> minutes
        </p>
      </div>

      <Button
        onClick={() => onCheckout(amount)}
        disabled={loading || amount < 1}
        size='lg'
        className={cn(
          'w-full font-semibold transition-all duration-300',
          'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black',
          'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:scale-[1.02] hover:brightness-110'
        )}
      >
        {loading ? 'Redirecting...' : 'Secure Checkout'}
      </Button>
    </div>
  );
}

// --- Monthly fund tab ---
function MonthlyFundTab({
  onSubscribe,
  onCancel,
  loading,
  currentSettings
}: {
  onSubscribe: (amount: number) => void;
  onCancel: () => void;
  loading: boolean;
  currentSettings: {
    monthlyFundEnabled: boolean;
    monthlyFundAmount: number | null;
  } | null;
}) {
  const [amount, setAmount] = useState(
    currentSettings?.monthlyFundAmount ?? 50
  );
  const isActive = currentSettings?.monthlyFundEnabled ?? false;

  if (isActive) {
    return (
      <div className='space-y-4'>
        <div className='rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4'>
          <div className='flex items-center gap-2'>
            <CalendarSync className='h-4 w-4 text-emerald-400' />
            <span className='text-sm font-medium'>
              Monthly fund active
            </span>
          </div>
          <p className='text-muted-foreground mt-1 text-sm'>
            <strong>${currentSettings?.monthlyFundAmount?.toFixed(2)}</strong>{' '}
            will be added to your balance every month automatically.
          </p>
        </div>

        <Button
          onClick={onCancel}
          disabled={loading}
          variant='outline'
          size='lg'
          className='w-full cursor-pointer border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300'
        >
          {loading ? 'Cancelling...' : 'Cancel Monthly Fund'}
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Set a fixed monthly amount that will be automatically added to your
        balance every month. No more manual recharges.
      </p>

      <div>
        <Label className='mb-2 block text-sm'>Monthly amount</Label>
        <div className='flex flex-wrap gap-2'>
          {[25, 50, 100, 200].map((val) => (
            <Button
              key={val}
              variant={val === amount ? 'default' : 'outline'}
              onClick={() => setAmount(val)}
              className={cn(
                'min-w-[70px] flex-1 cursor-pointer',
                val === amount
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm'
                  : 'hover:border-emerald-500 hover:text-emerald-400'
              )}
            >
              ${val}/mo
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor='monthly-custom'>Or enter custom amount</Label>
        <Input
          id='monthly-custom'
          type='number'
          min={5}
          placeholder='e.g. 75'
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          className='mt-1 max-w-[150px]'
        />
      </div>

      <div className='space-y-1 pt-1'>
        <div className='flex justify-between text-sm'>
          <span>Monthly charge</span>
          <span className='font-medium text-emerald-400'>
            ${amount.toFixed(2)}/month
          </span>
        </div>
        <p className='text-muted-foreground text-xs'>
          ~{Math.round(amount * 50)} minutes of calling per month
        </p>
      </div>

      <Button
        onClick={() => onSubscribe(amount)}
        disabled={loading || amount < 5}
        size='lg'
        className={cn(
          'w-full font-semibold transition-all duration-300',
          'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black',
          'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:scale-[1.02] hover:brightness-110'
        )}
      >
        {loading ? 'Redirecting...' : 'Subscribe Monthly Fund'}
      </Button>
    </div>
  );
}

// --- Auto-reload tab ---
function AutoReloadTab({
  onSetup,
  onToggle,
  loading,
  currentSettings
}: {
  onSetup: (threshold: number, reloadAmount: number) => void;
  onToggle: (enabled: boolean) => void;
  loading: boolean;
  currentSettings: {
    autoReloadEnabled: boolean;
    autoReloadThreshold: number;
    autoReloadAmount: number;
  } | null;
}) {
  const [threshold, setThreshold] = useState(
    currentSettings?.autoReloadThreshold ?? 5
  );
  const [reloadAmount, setReloadAmount] = useState(
    currentSettings?.autoReloadAmount ?? 25
  );
  const isActive = currentSettings?.autoReloadEnabled ?? false;

  if (isActive) {
    return (
      <div className='space-y-4'>
        <div className='rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4'>
          <div className='flex items-center gap-2'>
            <RefreshCw className='h-4 w-4 text-emerald-400' />
            <span className='text-sm font-medium'>Auto-reload active</span>
          </div>
          <p className='text-muted-foreground mt-1 text-sm'>
            When your balance drops below{' '}
            <strong>${currentSettings?.autoReloadThreshold?.toFixed(2)}</strong>,{' '}
            <strong>${currentSettings?.autoReloadAmount?.toFixed(2)}</strong>{' '}
            will be charged and added automatically.
          </p>
        </div>

        <div className='flex items-center justify-between'>
          <Label htmlFor='auto-reload-toggle' className='text-sm'>
            Auto-reload enabled
          </Label>
          <Switch
            id='auto-reload-toggle'
            checked={isActive}
            onCheckedChange={(checked) => onToggle(!!checked)}
            disabled={loading}
          />
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Never run out of credit. Set a minimum balance threshold and we&#39;ll
        automatically reload your account.
      </p>

      <div>
        <Label htmlFor='threshold'>Reload when balance drops below</Label>
        <div className='relative mt-1'>
          <span className='text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 text-sm'>
            $
          </span>
          <Input
            id='threshold'
            type='number'
            min={1}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value) || 0)}
            className='max-w-[150px] pl-7'
          />
        </div>
      </div>

      <div>
        <Label htmlFor='reload-amount'>Reload amount</Label>
        <div className='flex flex-wrap gap-2 mt-1'>
          {[10, 25, 50, 100].map((val) => (
            <Button
              key={val}
              variant={val === reloadAmount ? 'default' : 'outline'}
              onClick={() => setReloadAmount(val)}
              className={cn(
                'min-w-[60px] flex-1 cursor-pointer',
                val === reloadAmount
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm'
                  : 'hover:border-emerald-500 hover:text-emerald-400'
              )}
            >
              ${val}
            </Button>
          ))}
        </div>
        <Input
          id='reload-amount-custom'
          type='number'
          min={5}
          placeholder='Custom amount'
          value={reloadAmount}
          onChange={(e) => setReloadAmount(Number(e.target.value) || 0)}
          className='mt-2 max-w-[150px]'
        />
      </div>

      <div className='rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground'>
        Your card will be charged{' '}
        <strong>${reloadAmount.toFixed(2)}</strong> now and saved for future
        automatic reloads when your balance drops below{' '}
        <strong>${threshold.toFixed(2)}</strong>.
      </div>

      <Button
        onClick={() => onSetup(threshold, reloadAmount)}
        disabled={loading || threshold < 1 || reloadAmount < 5}
        size='lg'
        className={cn(
          'w-full font-semibold transition-all duration-300',
          'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black',
          'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:scale-[1.02] hover:brightness-110'
        )}
      >
        {loading ? 'Redirecting...' : 'Enable Auto-Reload'}
      </Button>
    </div>
  );
}

export function CreditPopover({
  children,
  fetch = true,
  useMock = false
}: {
  children?: React.ReactElement;
  fetch?: boolean;
  useMock?: boolean;
}) {
  const auth = useAuth();

  const [loading, setLoading] = useState(false);
  const api = useApi();
  const router = useRouter();

  const {
    balance,
    freeCallTrial,
    fetchBalance,
    fetchAutoReloadSettings,
    autoReloadSettings,
    status
  } = useCreditStore();
  const { completeStep: completeOnboardingStep } = useOnboardingComplete();

  const handleOneTimeCheckout = async (amount: number) => {
    setLoading(true);
    try {
      completeOnboardingStep('buy_credits');

      const { url } = await api.post('/stripe/checkout/credit', {
        amount
      });

      router.push(url);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleMonthlySubscribe = async (amount: number) => {
    setLoading(true);
    try {
      const { url } = await api.post('/stripe/checkout/credit-subscription', {
        amount
      });

      router.push(url);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleCancelMonthlyFund = async () => {
    setLoading(true);
    try {
      await api.delete('/credits/monthly-fund');
      await fetchAutoReloadSettings(api);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoReloadSetup = async (
    threshold: number,
    reloadAmount: number
  ) => {
    setLoading(true);
    try {
      const { url } = await api.post('/stripe/checkout/auto-reload-setup', {
        threshold,
        reloadAmount
      });

      router.push(url);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleAutoReloadToggle = async (enabled: boolean) => {
    setLoading(true);
    try {
      await api.patch('/credits/auto-reload-settings', {
        autoReloadEnabled: enabled
      });
      await fetchAutoReloadSettings(api);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fetch && (useMock || auth?.userId)) {
      fetchBalance(api, useMock);
      if (!useMock) {
        fetchAutoReloadSettings(api);
      }
    }
  }, [auth?.userId, fetch]);

  useCongrats();

  if (status === 'loading' || status === 'idle' || status === 'error') {
    return <Skeleton className='h-6 w-48' />;
  }

  if (freeCallTrial === true) {
    return (
      <MyButton
        freeCallTrial={freeCallTrial}
        balance={balance}
        onClick={() => router.push('/dashboard/call')}
      />
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children ? (
          children
        ) : (
          <Button
            variant='ghost'
            size='sm'
            className={cn(
              'group relative flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 font-semibold',
              'text-white transition-all duration-300 ease-out',
              'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400',
              'shadow-[0_0_18px_-4px_rgba(45,212,191,0.6)]',
              'hover:shadow-[0_0_25px_-4px_rgba(45,212,191,0.8)]',
              'cursor-pointer'
            )}
          >
            <span className='absolute inset-0 rounded-full bg-white/10 opacity-0 blur-sm transition-opacity group-hover:opacity-100' />

            <div className='z-10 flex items-center gap-2'>
              <Zap className='text-foreground h-4 w-4 transition-transform group-hover:rotate-6' />

              <span className='text-foreground font-semibold'>
                ${balance.toFixed(2)}
              </span>
              <span className='text-foreground hidden text-sm opacity-90 sm:inline'>
                Available credit
              </span>
            </div>

            <div className='bg-foreground/20 z-10 ml-1 flex h-6 w-6 items-center justify-center rounded-full'>
              <Plus className='text-foreground h-3.5 w-3.5' />
            </div>
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align='end'
        sideOffset={10}
        className='border-border/50 bg-background w-[400px] rounded-lg border p-6 shadow-2xl'
      >
        <div className='space-y-4'>
          {/* Header */}
          <div>
            <h3 className='flex items-center gap-2 text-base font-semibold'>
              <CreditCard className='h-4 w-4 text-emerald-400' />
              Add Credits
            </h3>
            <p className='text-muted-foreground text-sm'>
              Recharge instantly or set up automatic funding.
            </p>
          </div>

          {/* Tabs */}
          <Tabs defaultValue='one-time'>
            <TabsList className='w-full'>
              <TabsTrigger value='one-time' className='flex-1 text-xs'>
                <CreditCard className='mr-1 h-3 w-3' />
                One-time
              </TabsTrigger>
              <TabsTrigger value='monthly' className='flex-1 text-xs'>
                <CalendarSync className='mr-1 h-3 w-3' />
                Monthly
              </TabsTrigger>
              <TabsTrigger value='auto-reload' className='flex-1 text-xs'>
                <RefreshCw className='mr-1 h-3 w-3' />
                Auto-reload
              </TabsTrigger>
            </TabsList>

            <TabsContent value='one-time'>
              <OneTimeTab
                onCheckout={handleOneTimeCheckout}
                loading={loading}
              />
            </TabsContent>

            <TabsContent value='monthly'>
              <MonthlyFundTab
                onSubscribe={handleMonthlySubscribe}
                onCancel={handleCancelMonthlyFund}
                loading={loading}
                currentSettings={autoReloadSettings}
              />
            </TabsContent>

            <TabsContent value='auto-reload'>
              <AutoReloadTab
                onSetup={handleAutoReloadSetup}
                onToggle={handleAutoReloadToggle}
                loading={loading}
                currentSettings={autoReloadSettings}
              />
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className='text-muted-foreground flex items-center justify-between border-t pt-3 text-xs'>
            <div className='flex items-center gap-1'>
              <ShieldCheck className='h-3.5 w-3.5 text-emerald-400' />
              Secure by Stripe
            </div>
            <div className='flex items-center gap-1'>
              <DollarSign className='h-3.5 w-3.5 text-emerald-400' />
              100% Refund Guarantee
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
