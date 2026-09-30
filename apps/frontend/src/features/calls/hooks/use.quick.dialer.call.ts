'use client';

import { useDialerStore } from '../store/dialer.store';
import { useDial } from './use.dial';

/**
 * "Call" / "Call again" from anywhere in the dashboard — a contact, a history
 * row, a call's detail. It places the call right where the user is: no trip to
 * the call page, no second click on the keypad. The active-call modal opens on
 * top of the current screen.
 */
export function useQuickDialerCall() {
  const quickDialState = useDialerStore((s) => s.quickDialState);
  const { dial, dialingNumber, busy } = useDial();

  const handleRecall = (phoneNumber: string) => dial(phoneNumber);

  return {
    isQuickDialerOpen: quickDialState === 'open',
    handleRecall,
    /** The number currently being dialed, for a spinner on its button. */
    dialingNumber,
    busy
  };
}
