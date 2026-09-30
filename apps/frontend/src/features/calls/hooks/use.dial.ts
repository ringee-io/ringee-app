'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import type { ApiClient } from '@ringee/frontend-shared/lib/api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { isLiveCallState } from '@/features/dialer/store/dialer-call.store';
import { useDialerSessionStore } from '@/features/dialer/store/dialer-session.store';
import { confirmDncCall } from '../store/dnc-prompt.store';
import { useDialerStore } from '../store/dialer.store';
import {
  ensureNumbersLoaded,
  isSelectableNumber,
  useNumbersStore
} from '../store/number.selector.store';
import {
  confirmPublicNumberCall,
  isPublicNumberWarningDismissed
} from '../store/public-number-prompt.store';
import { useTelnyxStore } from '../store/telnyx.store';
import { useCall } from './use.call';

/** How long a dial waits for the phone line to register before giving up. */
const LINE_WAIT_MS = 10_000;

interface DncCheckResponse {
  phoneNumber: string;
  isOnDNC: boolean;
  reason: string | null;
  source: string | null;
  addedAt: string | null;
}

function isLineReady(state = useTelnyxStore.getState()): boolean {
  return !!state.client && state.status === 'registered';
}

/** Resolves once the line is registered, or `false` after `timeoutMs`. */
function waitForLine(timeoutMs: number): Promise<boolean> {
  if (isLineReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    unsubscribe = useTelnyxStore.subscribe((state) => {
      if (!isLineReady(state)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

/**
 * Whether the call would go out from the shared public number: it is the
 * selected caller ID, and caller-ID rotation is not about to pick one of the
 * workspace's numbers instead — with rotation on, that same selector entry
 * reads "Auto". The server still decides; this only decides whether to say so.
 */
async function dialsFromPublicNumber(api: ApiClient): Promise<boolean> {
  const selected = useNumbersStore.getState().selectedNumber;
  if (selected?.id !== 'public' || !selected.phoneNumber) return false;
  try {
    const rotation = await api.get<{ enabled: boolean }>(
      '/caller-id-rotation/settings'
    );
    return !rotation?.enabled;
  } catch {
    // Unknown: one warning too many beats a public-number call unannounced.
    return true;
  }
}

/**
 * The one way the dashboard starts a manual call: from the keypad, a contact,
 * a callback, a meeting, a recent call or a call's detail. It dials in place —
 * the active-call modal opens wherever the user is — and applies the same
 * checks everywhere: one dial at a time, not over a live call or a campaign
 * session, calling rights and credit, a warning before a call from the shared
 * public number, and the Do Not Call confirmation. The server-side pre-flight
 * in `handleCall` stays the authority on all of them.
 *
 * Resolves `true` when a leg was placed.
 */
export function useDial() {
  const t = useTranslations('calls.dialer');
  const api = useApi();
  const router = useRouter();
  const { canAccessAdminFeatures } = useOrgRole();
  const { handleCall } = useCall();
  const dialingNumber = useDialerStore((s) => s.dialingNumber);
  const lineStatus = useTelnyxStore((s) => s.status);
  const onCall = useTelnyxStore((s) => isLiveCallState(s.activeCall?.state));

  const dial = useCallback(
    async (rawNumber: string): Promise<boolean> => {
      const phoneNumber = rawNumber.trim();
      if (!phoneNumber) return false;

      const dialer = useDialerStore.getState();
      // A double click, or a second surface, while the first dial is starting.
      if (dialer.dialingNumber) return false;

      if (useDialerSessionStore.getState().sessionId) {
        toast.error(t('campaignSessionActive'));
        return false;
      }
      if (isLiveCallState(useTelnyxStore.getState().activeCall?.state)) {
        toast.error(t('alreadyOnCall'));
        return false;
      }

      const credit = useCreditStore.getState();
      if (credit.status === 'success') {
        if (!credit.canCall) {
          toast.error(t('outboundDisabled'));
          return false;
        }
        if (
          canAccessAdminFeatures &&
          !credit.freeCallTrial &&
          credit.balance <= 0
        ) {
          toast.error(t('noCredit'), {
            action: {
              label: t('addCredit'),
              onClick: () => router.push('/dashboard/billing')
            }
          });
          return false;
        }
      }

      dialer.setNumber(phoneNumber);
      dialer.setDialingNumber(phoneNumber);
      const lineToast = isLineReady()
        ? null
        : toast.loading(t('lineConnecting'));
      try {
        const lineReady = await waitForLine(LINE_WAIT_MS);
        if (lineToast !== null) toast.dismiss(lineToast);
        if (!lineReady) {
          toast.error(t('lineUnavailable'));
          return false;
        }

        // The number the call goes out from is the user's choice, restored
        // with the workspace's numbers: load them before anything reads it.
        await ensureNumbersLoaded(api);
        if (
          !isPublicNumberWarningDismissed() &&
          (await dialsFromPublicNumber(api))
        ) {
          const callAnyway = await confirmPublicNumberCall({
            hasOwnNumbers: useNumbersStore
              .getState()
              .numbers.some(isSelectableNumber)
          });
          if (!callAnyway) return false;
        }

        try {
          const res = await api.get<DncCheckResponse>(
            `/dnc/check/${encodeURIComponent(phoneNumber)}`
          );
          if (res?.isOnDNC) {
            const callAnyway = await confirmDncCall({
              phoneNumber,
              reason: res.reason,
              addedAt: res.addedAt
            });
            if (!callAnyway) return false;
          }
        } catch (err) {
          // DNC check is best-effort: a 4xx/5xx must NOT block legitimate calls.
          // Compliance is a backstop, not a single point of failure.
          console.warn('DNC check failed, proceeding with call', err);
        }

        return await handleCall(phoneNumber);
      } catch (err) {
        console.error('❌ Could not start the call:', err);
        toast.error(t('dialFailed'));
        return false;
      } finally {
        if (lineToast !== null) toast.dismiss(lineToast);
        useDialerStore.getState().setDialingNumber(null);
      }
    },
    [api, canAccessAdminFeatures, handleCall, router, t]
  );

  return {
    dial,
    /** The number whose dial is starting (DNC check, pre-flight), if any. */
    dialingNumber,
    /** True while a call is live or a dial is starting — offer no new dial. */
    busy: onCall || dialingNumber !== null,
    onCall,
    lineStatus
  };
}
