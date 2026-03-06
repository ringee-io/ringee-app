'use client';

import { useRouter } from 'next/navigation';
import { useDialerStore } from '../store/dialer.store';

/**
 * Hook to handle re-call logic based on quick dialer state.
 * If the quick dialer is open, updates the dialer store with the phone number.
 * If the quick dialer is closed, redirects to the call page.
 */
export function useQuickDialerCall() {
  const router = useRouter();
  const { quickDialState, setNumber } = useDialerStore();

  const isQuickDialerOpen = quickDialState === 'open';

  const handleRecall = (phoneNumber: string) => {
    if (isQuickDialerOpen) {
      // Quick dialer is open, just update the store
      setNumber(phoneNumber);
    } else {
      // Redirect to call page
      router.push(`/dashboard/call?tab=dialer&phoneNumber=${phoneNumber}`);
    }
  };

  return {
    isQuickDialerOpen,
    handleRecall,
  };
}
