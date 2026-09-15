'use client';

import { useCallback, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerSessionStore } from '../store/dialer-session.store';

export interface DisposeLeadInput {
  dispositionCode: string;
  note?: string;
  /** `datetime-local` value; only read for a callback disposition. */
  callbackScheduledAt?: string;
  callbackNote?: string;
}

/**
 * The single path that writes a campaign disposition.
 *
 * Both surfaces go through it — the live popup that ends a call with one click
 * and the wrap-up panel that collects notes afterwards — so the "close the
 * session after this lead" flag and the attempt id are read the same way in
 * both, from the store at submit time rather than from a render-time prop. An
 * agent can tick the box while the call is still running and it still counts.
 */
export function useDisposeLead() {
  const api = useApi();
  const t = useTranslations('dialer.disposition');
  const [submitting, setSubmitting] = useState(false);

  const dispose = useCallback(
    async (input: DisposeLeadInput): Promise<boolean> => {
      const attemptId = useDialerAttemptStore.getState().attemptId;
      if (!attemptId) return false;

      setSubmitting(true);
      try {
        const result = await api.post<{ sessionClosed?: boolean }>(
          '/dialer/dispose',
          {
            callAttemptId: attemptId,
            dispositionCode: input.dispositionCode,
            note: input.note || undefined,
            ...(input.callbackScheduledAt
              ? {
                  callbackScheduledAt: new Date(
                    input.callbackScheduledAt
                  ).toISOString(),
                  callbackNote: input.callbackNote || undefined
                }
              : {}),
            // Decided server-side inside this same request: a progressive
            // campaign polls every 500ms, so ending the session from the
            // browser a moment later would already be one call too late.
            closeSession: useDialerSessionStore.getState().closeAfterLead
          }
        );
        toast.success(t('saved'));
        // The server pushes where the session went over SSE. The answer to
        // this request is the fallback for when that event never arrives —
        // applied only while the screen is still on this attempt, because by
        // now the next lead may already be on it.
        if (useDialerAttemptStore.getState().attemptId === attemptId) {
          useDialerLeadStore.getState().clear();
          useDialerAttemptStore.getState().clear();
          if (result?.sessionClosed) {
            useDialerSessionStore.getState().clear();
          } else {
            useDialerSessionStore.getState().setStatus('ready');
          }
        }
        return true;
      } catch (err: any) {
        toast.error(err?.message || t('saveFailed'));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [api, t]
  );

  return { dispose, submitting };
}
