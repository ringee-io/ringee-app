'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';
import { AlertTriangle, PhoneOff } from 'lucide-react';
import { hangupCall, useCallStore } from '@ringee/dialer-core';
import {
  useUserEvents,
  type RealtimeServerEvent
} from '@ringee/frontend-shared/realtime';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useTelnyxStore } from '@/features/calls/store/telnyx.store';
import { ConcurrentCallDialog } from './concurrent-call-dialog';

/** How long the block notice stays up before the session is signed out. */
const SIGN_OUT_DELAY_MS = 6_000;

/**
 * Enforces account-level actions in real time on this device.
 *
 * Mount once, inside the authenticated shell. It holds the single realtime
 * socket for the signed-in user and reacts to what the backoffice does:
 *
 * - `account.blocked` — hang up the live WebRTC leg, tear the dialer down, show
 *   a notice that cannot be dismissed, then sign out. The calls are already
 *   dead server-side; this is what makes the UI honest immediately instead of
 *   on the next API request.
 * - `calls.terminated` — hang up, but leave the session alone.
 * - `account.restored` — tell the user they can carry on.
 *
 * The socket is a courier, not a gatekeeper: everything it announces has
 * already been enforced by the API. Nothing here is a security boundary.
 */
export function AccountLockdownProvider({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  const [lockdown, setLockdown] = useState<{
    message: string;
    reason: string;
  } | null>(null);
  const signOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Drop the WebRTC leg and every trace of the call in local state. Best
   * effort by design — a failed hangup must not stop the rest of the teardown,
   * and the provider-side leg is already gone either way.
   */
  const tearDownCalls = useCallback(async (disconnectClient: boolean) => {
    const { activeCall, queue, client, clear } = useTelnyxStore.getState();

    await Promise.allSettled(
      [activeCall, ...queue]
        .filter(Boolean)
        .map((call) => hangupCall(call as Parameters<typeof hangupCall>[0]))
    );

    clear();
    useCallStore.getState().reset();

    if (disconnectClient && client) {
      try {
        client.disconnect();
      } catch {
        /* the socket may already be gone */
      }
      useTelnyxStore.getState().setClient(null);
      useTelnyxStore.getState().setStatus('disconnected');
    }
  }, []);

  const onEvent = useCallback(
    (event: RealtimeServerEvent) => {
      switch (event.type) {
        case 'account.blocked': {
          // Unregister from Telnyx too: while the account is blocked this
          // device must not be able to receive an inbound leg either.
          void tearDownCalls(true);
          setLockdown({ message: event.message, reason: event.reason });
          if (!signOutTimer.current) {
            signOutTimer.current = setTimeout(
              () => void signOut({ redirectUrl: '/auth/sign-in' }),
              SIGN_OUT_DELAY_MS
            );
          }
          break;
        }
        case 'calls.terminated': {
          void tearDownCalls(false);
          toast.error(event.message, { duration: 8000 });
          break;
        }
        case 'account.restored': {
          toast.success('Your account access has been restored.');
          break;
        }
        default:
          break;
      }
    },
    [signOut, tearDownCalls]
  );

  useUserEvents({ onEvent, client: 'web' });

  return (
    <>
      {children}
      {/* Mounted here so any dial path in the shell can raise it. */}
      <ConcurrentCallDialog />
      {lockdown ? (
        <AccountBlockedNotice
          message={lockdown.message}
          reason={lockdown.reason}
          onSignOut={() => void signOut({ redirectUrl: '/auth/sign-in' })}
        />
      ) : null}
    </>
  );
}

/**
 * Deliberately not an AlertDialog: this overlay must not be dismissable with
 * Escape or an outside click, and it must sit above every other layer.
 */
function AccountBlockedNotice({
  message,
  reason,
  onSignOut
}: {
  message: string;
  reason: string;
  onSignOut: () => void;
}) {
  return (
    <div
      role='alertdialog'
      aria-modal='true'
      aria-labelledby='account-blocked-title'
      className='bg-background/95 fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm'
    >
      <div className='bg-card w-full max-w-md rounded-lg border p-6 shadow-lg'>
        <div className='flex items-start gap-3'>
          <div className='bg-destructive/10 text-destructive rounded-full p-2'>
            <AlertTriangle className='h-5 w-5' />
          </div>
          <div className='space-y-1'>
            <h2 id='account-blocked-title' className='text-lg font-semibold'>
              Account disabled
            </h2>
            <p className='text-muted-foreground text-sm'>{message}</p>
          </div>
        </div>

        <div className='text-muted-foreground mt-4 flex items-center gap-2 rounded-md border border-dashed p-3 text-xs'>
          <PhoneOff className='h-4 w-4 shrink-0' />
          <span>
            All active calls on every one of your devices have been ended.
          </span>
        </div>

        <p className='text-muted-foreground mt-4 font-mono text-[11px]'>
          reason: {reason}
        </p>

        <Button
          className='mt-4 w-full'
          variant='destructive'
          onClick={onSignOut}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
