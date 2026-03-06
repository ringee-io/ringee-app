'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

function safeGtag(...args: any[]) {
  if (typeof window === 'undefined') return;
  // @ts-ignore
  if (!window.gtag) {
    console.warn('[Analytics] gtag not ready', args[0]);
    return;
  }
  // @ts-ignore
  window.gtag(...args);
}

function safeAhrefs(event: string, data: Record<string, any> = {}) {
  if (typeof window === 'undefined') return;
  // @ts-ignore
  const ahrefs = window.ahrefs_analytics;
  if (!ahrefs || typeof ahrefs.trackEvent !== 'function') {
    console.warn('[Analytics] Ahrefs not ready', event);
    return;
  }

  try {
    // @ts-ignore
    ahrefs.trackEvent(event, data);
  } catch (err) {
    console.error('[Analytics] Ahrefs error:', err);
  }
}

export function useAnalytics(
  { topLevel }: { topLevel?: boolean } = { topLevel: false }
) {
  const pathname = usePathname();
  const user = useUser();

  useEffect(() => {
    if (topLevel && typeof window !== 'undefined') {
      safeGtag('event', 'page_view', { page_path: pathname });
      safeAhrefs('page_view', { page_path: pathname });
    }
  }, [topLevel, pathname]);

  const track = (event: string, params: Record<string, any> = {}) => {
    if (!user.isLoaded) return;
    const userId = user.user?.id || params.user_id;
    const payload = { ...params, user_id: userId };

    safeGtag('event', event, payload);
    safeAhrefs(event, payload);
  };

  const trackNewCall = (callId: string) => {
    track('call_start', {
      event_category: 'calls',
      event_label: `Call ${callId}`,
      value: 1
    });
  };

  const trackUserSignup = (userId: string) => {
    track('sign_up', {
      method: 'Clerk',
      event_category: 'user',
      event_label: 'User Registered',
      user_id: userId
    });
  };

  const trackNumberPurchase = (numberId: string, amount: number) => {
    track('purchase', {
      transaction_id: numberId,
      value: amount,
      currency: 'USD',
      items: [{ item_id: numberId, item_name: 'Number Purchase' }]
    });
  };

  const trackCreditPurchase = (amount: number) => {
    track('purchase', {
      transaction_id: `credit-${Date.now()}`,
      value: amount,
      currency: 'USD',
      items: [{ item_name: 'Credit Purchase', price: amount }]
    });
  };

  const trackCallsReceived = (count: number) => {
    track('calls_received', {
      event_category: 'product',
      event_label: 'Calls Received',
      value: count
    });
  };

  return {
    trackNewCall,
    trackUserSignup,
    trackNumberPurchase,
    trackCreditPurchase,
    trackCallsReceived
  };
}
