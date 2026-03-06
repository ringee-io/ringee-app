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
import { CreditCard, Zap, Plus, ShieldCheck, DollarSign } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useCongrats } from '@ringee/frontend-shared/hooks/use.congrats';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { useAuth } from '@clerk/nextjs';

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

  const [amount, setAmount] = useState(25);
  const [loading, setLoading] = useState(false);
  const api = useApi();
  const router = useRouter();

  const estimatedMinutes = Math.round(amount * 50);
  const level = Math.min(100, (amount / 100) * 100);

  const { balance, freeCallTrial, fetchBalance, status } = useCreditStore();

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const { url } = await api.post('/stripe/checkout/credit', {
        amount,
        frontendOrigin: typeof window !== 'undefined' ? window.location.origin : undefined
      });

      router.push(url);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (fetch && (useMock || auth?.userId)) {
      fetchBalance(api, useMock);
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
        onClick={() => router.push('/call')}
      />
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* 💳 Wallet Button Mejorado */}

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
            {/* Glow animation */}
            <span className='absolute inset-0 rounded-full bg-white/10 opacity-0 blur-sm transition-opacity group-hover:opacity-100' />

            {/* Wallet info */}
            <div className='z-10 flex items-center gap-2'>
              <Zap className='text-foreground h-4 w-4 transition-transform group-hover:rotate-6' />

              <span className='text-foreground font-semibold'>
                ${balance.toFixed(2)}
              </span>
              <span className='text-foreground hidden text-sm opacity-90 sm:inline'>
                Available credit
              </span>
            </div>

            {/* Floating plus */}
            <div className='bg-foreground/20 z-10 ml-1 flex h-6 w-6 items-center justify-center rounded-full'>
              <Plus className='text-foreground h-3.5 w-3.5' />
            </div>
          </Button>
        )}
      </PopoverTrigger>

      {/* 🧾 Popover Content */}
      <PopoverContent
        align='end'
        sideOffset={10}
        className='border-border/50 bg-background w-[380px] rounded-lg border p-6 shadow-2xl'
      >
        <div className='space-y-5'>
          {/* Header */}
          <div>
            <h3 className='flex items-center gap-2 text-base font-semibold'>
              <CreditCard className='h-4 w-4 text-emerald-400' />
              Add Credits to Your Ringee Balance
            </h3>
            <p className='text-muted-foreground text-sm'>
              Recharge instantly to continue calling, recording, and managing
              clients without interruption.
            </p>
          </div>

          {/* Amount presets */}
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

          {/* Custom input */}
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

          {/* Auto Top-Up */}
          {/* <div className="flex items-start gap-2">
            <Checkbox
              id="auto"
              checked={autoTopup}
              onCheckedChange={(val) => setAutoTopup(!!val)}
            />
            <Label htmlFor="auto" className="text-sm leading-tight">
              Enable Smart Auto-Top-up
              <span className="block text-xs text-muted-foreground">
                Automatically recharge when your balance drops below $2.
              </span>
            </Label>
          </div> */}

          {/* Progress + Estimation */}
          <div className='space-y-2 pt-2'>
            <div className='flex justify-between text-sm'>
              <span>New balance</span>
              <span className='font-medium text-emerald-400'>
                ${amount.toFixed(2)}
              </span>
            </div>
            <Progress value={level} className='bg-muted h-2 overflow-hidden' />
            <p className='text-muted-foreground text-xs'>
              Estimated calling time: <strong>{estimatedMinutes}</strong>{' '}
              minutes
            </p>
          </div>

          {/* CTA — Secure Checkout */}
          <Button
            onClick={handleCheckout}
            disabled={loading}
            size='lg'
            className={cn(
              'w-full font-semibold transition-all duration-300',
              'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black',
              'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:scale-[1.02] hover:brightness-110'
            )}
          >
            {loading ? 'Redirecting...' : 'Secure Checkout'}
          </Button>

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
