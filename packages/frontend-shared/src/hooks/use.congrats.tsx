'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
// @ts-ignore
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { useAnalytics } from './use.analytics';
import { usePathname } from 'next/navigation';

export function useCongrats() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { trackCreditPurchase, trackNumberPurchase } = useAnalytics();

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (!paymentStatus) return;

    const showConfetti = () => {
      confetti({
        particleCount: 140,
        spread: 75,
        origin: { y: 0.6 },
        ticks: 250,
        gravity: 0.8,
        scalar: 1.1,
        colors: ['#10b981', '#14b8a6', '#06b6d4', '#34d399']
      });
    };

    if (paymentStatus === 'success') {
      showConfetti();

      toast('Payment Successful 🎉', {
        duration: 5000,
        className:
          'border border-emerald-500/60 bg-background/95 text-foreground shadow-lg backdrop-blur-md',
        description: searchParams.get('msg')
      });

      const tab = searchParams.get('tab');
      const amount = Number(searchParams.get('amount')) || 0;

      if (tab === 'my-numbers') {
        trackNumberPurchase(searchParams.get('numberId') || '', amount);
      } else {
        trackCreditPurchase(amount);
      }
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('payment');
    params.delete('msg');
    const cleanUrl = `${window.location.pathname}${
      params.toString() ? `?${params.toString()}` : ''
    }`;
    router.replace(cleanUrl);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}
