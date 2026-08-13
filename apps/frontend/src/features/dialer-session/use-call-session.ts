'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CallOutcome,
  ItemStatus,
  SessionApiError,
  SessionDto,
  SessionItemDto,
  TelephonyCredential,
  sessionApi
} from './api';
import { useSessionTelnyx } from './use-session-telnyx';
import { useSessionCall } from './use-session-call';
import { useTranslations } from 'next-intl';

export type CallSessionPhase =
  | 'loading'
  | 'error'
  | 'preview'
  | 'dialing'
  | 'in_call'
  | 'wrap_up'
  | 'completed';

export type DialerMode = 'preview' | 'progressive';

export type CallSessionErrorVariant =
  | 'expired'
  | 'revoked'
  | 'invalid'
  | 'credits'
  | 'completed'
  | 'generic';

export interface CallSessionError {
  title: string;
  message: string;
  variant: CallSessionErrorVariant;
}

const TERMINAL_STATUSES: ItemStatus[] = ['completed', 'skipped', 'failed'];
const DIALER_MODE_STORAGE_KEY = 'ringee.session.dialerMode';

function findNextPending(
  items: SessionItemDto[],
  afterItemId: string | null
): SessionItemDto | null {
  const startIdx = afterItemId
    ? items.findIndex((i) => i.id === afterItemId)
    : -1;
  for (let offset = 1; offset <= items.length; offset++) {
    const idx = (startIdx + offset + items.length) % items.length;
    if (items[idx].status === 'pending') return items[idx];
  }
  return null;
}

function updateItem(
  items: SessionItemDto[],
  itemId: string,
  patch: Partial<SessionItemDto>
): SessionItemDto[] {
  return items.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
}

function loadInitialMode(): DialerMode {
  if (typeof window === 'undefined') return 'preview';
  const v = window.localStorage.getItem(DIALER_MODE_STORAGE_KEY);
  return v === 'progressive' ? 'progressive' : 'preview';
}

export function useCallSession(token: string) {
  const t = useTranslations('dialer.publicSession.errors');
  const [phase, setPhase] = useState<CallSessionPhase>('loading');
  const [error, setError] = useState<CallSessionError | null>(null);
  const [session, setSession] = useState<SessionDto | null>(null);
  const [creditsOk, setCreditsOk] = useState(true);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [callerIdNumber, setCallerIdNumber] = useState<string | null>(null);
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [recordAllCalls, setRecordAllCalls] = useState(false);
  const [telephony, setTelephony] = useState<TelephonyCredential | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transientError, setTransientError] = useState<string | null>(null);
  const [mode, setModeState] = useState<DialerMode>(() => loadInitialMode());
  const autoDialRequested = useRef(false);

  const telnyx = useSessionTelnyx(telephony);
  const sessionCall = useSessionCall(telnyx.client, telnyx.notification);

  // ── Load / refresh ────────────────────────────────────────

  const load = useCallback(async () => {
    if (!token) {
      setError(toError('invalid', t));
      setPhase('error');
      return;
    }
    try {
      setPhase('loading');
      setError(null);
      const res = await sessionApi.validate(token);
      setSession(res.session);
      setCreditsOk(res.creditsOk);
      setCreditBalance(res.creditBalance);
      setCallerIdNumber(res.callerIdNumber);
      setRotationEnabled(res.rotationEnabled ?? false);
      setRecordAllCalls(res.recordAllCalls ?? false);
      setTelephony(res.telephony);
      const firstPending = res.session.items.find(
        (i) => i.status === 'pending'
      );
      setActiveItemId(firstPending?.id ?? res.session.items[0]?.id ?? null);

      if (res.session.status === 'completed') {
        setPhase('completed');
      } else if (!res.creditsOk) {
        setError(toError('credits', t));
        setPhase('error');
      } else {
        setPhase('preview');
      }
    } catch (err) {
      const apiErr = err as SessionApiError;
      const variant = pickVariant(apiErr);
      setError(toError(variant, t, apiErr?.message));
      setPhase('error');
    }
  }, [token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh credit balance periodically (between calls), without re-validating
  // the entire session — keeps the Dial button accurate live.
  useEffect(() => {
    if (!token) return;
    if (phase === 'loading' || phase === 'error') return;
    const id = setInterval(async () => {
      try {
        const c = await sessionApi.credit(token);
        setCreditBalance(c.balance);
        setCreditsOk(c.creditsOk);
      } catch {
        // ignore — handled by next user action
      }
    }, 20_000);
    return () => clearInterval(id);
  }, [token, phase]);

  // Persist dialer mode.
  const setMode = useCallback((next: DialerMode) => {
    setModeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DIALER_MODE_STORAGE_KEY, next);
    }
  }, []);

  // ── Derived ────────────────────────────────────────────────

  const items = session?.items ?? [];
  const activeItem = useMemo(
    () => items.find((i) => i.id === activeItemId) ?? null,
    [items, activeItemId]
  );

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.status === 'completed').length;
    const skipped = items.filter((i) => i.status === 'skipped').length;
    const failed = items.filter((i) => i.status === 'failed').length;
    const remaining = total - completed - skipped - failed;
    const positive = items.filter(
      (i) =>
        i.outcome === 'meeting_booked' ||
        i.outcome === 'sale' ||
        i.outcome === 'interested'
    ).length;
    const contactRate =
      completed > 0 ? Math.round((positive / completed) * 100) : 0;
    return {
      total,
      completed,
      skipped,
      failed,
      remaining,
      positive,
      contactRate
    };
  }, [items]);

  // ── Phase from Telnyx call state ──────────────────────────

  useEffect(() => {
    if (
      sessionCall.callState === 'ringing' ||
      sessionCall.callState === 'dialing'
    ) {
      setPhase('dialing');
    } else if (
      sessionCall.callState === 'connected' ||
      sessionCall.callState === 'held'
    ) {
      setPhase('in_call');
    } else if (sessionCall.callState === 'ended') {
      // Only flip to wrap_up if we were actively calling.
      setPhase((p) => (p === 'in_call' || p === 'dialing' ? 'wrap_up' : p));
    }
  }, [sessionCall.callState]);

  // ── Actions ────────────────────────────────────────────────

  const selectItem = useCallback(
    (id: string) => {
      if (phase !== 'preview') return;
      const target = items.find((i) => i.id === id);
      if (!target || TERMINAL_STATUSES.includes(target.status)) return;
      setActiveItemId(id);
    },
    [items, phase]
  );

  const dial = useCallback(async () => {
    if (!session || !activeItem || phase !== 'preview') return;
    if (!telnyx.client || telnyx.status !== 'registered') {
      setTransientError(t('phoneConnecting'));
      return;
    }
    if (!creditsOk) {
      setTransientError(t('insufficientCredits'));
      return;
    }
    setBusy(true);
    setTransientError(null);
    try {
      const res = await sessionApi.startCall(session.id, activeItem.id, token);
      sessionCall.dial({
        destinationNumber: res.phoneNumber,
        callerIdNumber: res.callerIdNumber,
        customHeaders: res.customHeaders
      });
      setSession((s) =>
        s
          ? {
              ...s,
              items: updateItem(s.items, activeItem.id, { status: 'calling' })
            }
          : s
      );
      setPhase('dialing');
    } catch (err) {
      setTransientError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [
    session,
    activeItem,
    phase,
    token,
    telnyx.client,
    telnyx.status,
    creditsOk,
    sessionCall,
    t
  ]);

  const hangup = useCallback(async () => {
    if (!session || !activeItem) return;
    setBusy(true);
    setTransientError(null);
    try {
      await sessionCall.hangup();
      void sessionApi
        .endCall(session.id, activeItem.id, token)
        .catch(() => undefined);
      setPhase('wrap_up');
    } catch (err) {
      setTransientError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [session, activeItem, sessionCall, token]);

  const skip = useCallback(async () => {
    if (!session || !activeItem) return;
    setBusy(true);
    setTransientError(null);
    try {
      const res = await sessionApi.skip(session.id, activeItem.id, token);
      setSession((s) =>
        s
          ? {
              ...s,
              progress: {
                ...s.progress,
                completed: s.progress.completed + 1,
                remaining: Math.max(0, s.progress.remaining - 1)
              },
              items: updateItem(s.items, activeItem.id, { status: 'skipped' })
            }
          : s
      );
      if (res.sessionCompleted) {
        setActiveItemId(null);
        setPhase('completed');
      } else {
        const next = findNextPending(session.items, activeItem.id);
        setActiveItemId(next?.id ?? null);
        setPhase(next ? 'preview' : 'completed');
        if (next && mode === 'progressive') autoDialRequested.current = true;
      }
    } catch (err) {
      setTransientError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [session, activeItem, token, mode]);

  const saveOutcome = useCallback(
    async (
      outcome: CallOutcome,
      body: {
        outcomeNote?: string;
        callbackAt?: string;
        meeting?: {
          scheduledAt: string;
          title?: string;
          duration?: number;
          attendeeEmail?: string;
        };
      },
      action: 'continue' | 'stop'
    ) => {
      if (!session || !activeItem) return;
      setBusy(true);
      setTransientError(null);
      try {
        const res = await sessionApi.saveOutcome(
          session.id,
          activeItem.id,
          token,
          {
            outcome,
            outcomeNote: body.outcomeNote ?? null,
            callbackAt: body.callbackAt ?? null,
            meeting: body.meeting
              ? {
                  scheduledAt: body.meeting.scheduledAt,
                  title: body.meeting.title,
                  duration: body.meeting.duration,
                  attendeeEmail: body.meeting.attendeeEmail
                }
              : null
          }
        );
        setSession((s) =>
          s
            ? {
                ...s,
                progress: {
                  ...s.progress,
                  completed: s.progress.completed + 1,
                  remaining: Math.max(0, s.progress.remaining - 1)
                },
                items: updateItem(s.items, activeItem.id, {
                  status: 'completed',
                  outcome
                })
              }
            : s
        );
        const justEndedItemId = activeItem.id;
        if (res.sessionCompleted || action === 'stop') {
          setActiveItemId(null);
          setPhase('completed');
        } else {
          const next = findNextPending(session.items, justEndedItemId);
          setActiveItemId(next?.id ?? null);
          setPhase(next ? 'preview' : 'completed');
          if (next && mode === 'progressive' && action === 'continue') {
            autoDialRequested.current = true;
          }
        }
      } catch (err) {
        setTransientError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [session, activeItem, token, mode]
  );

  // Progressive auto-dial: kick the next call once we settle on a fresh
  // preview phase and the Telnyx line is ready.
  useEffect(() => {
    if (!autoDialRequested.current) return;
    if (phase !== 'preview') return;
    if (!activeItem) {
      autoDialRequested.current = false;
      return;
    }
    if (telnyx.status !== 'registered' || !creditsOk) return;
    autoDialRequested.current = false;
    const id = setTimeout(() => {
      void dial();
    }, 600);
    return () => clearTimeout(id);
  }, [phase, activeItem, telnyx.status, creditsOk, dial]);

  // ── Recording / DTMF passthroughs ─────────────────────────

  const toggleRecording = useCallback(async () => {
    if (!session || !activeItem) return;
    setTransientError(null);
    try {
      await sessionCall.toggleRecording({
        sessionId: session.id,
        itemId: activeItem.id,
        token
      });
    } catch (err) {
      setTransientError((err as Error).message);
    }
  }, [session, activeItem, token, sessionCall]);

  return {
    phase,
    error,
    session,
    creditsOk,
    creditBalance,
    callerIdNumber,
    rotationEnabled,
    recordAllCalls,
    items,
    activeItem,
    busy,
    transientError,
    stats,
    mode,
    telnyxStatus: telnyx.status,
    call: {
      state: sessionCall.callState,
      isMuted: sessionCall.isMuted,
      isOnHold: sessionCall.isOnHold,
      isRecording: sessionCall.isRecording,
      isRecordingLoading: sessionCall.isRecordingLoading
    },
    actions: {
      reload: load,
      selectItem,
      setMode,
      dial,
      hangup,
      skip,
      saveOutcome,
      toggleMute: sessionCall.toggleMute,
      toggleHold: sessionCall.toggleHold,
      toggleRecording,
      sendDTMF: sessionCall.sendDTMF
    }
  };
}

// ── Helpers ─────────────────────────────────────────────────

function pickVariant(
  err: SessionApiError | undefined
): CallSessionErrorVariant {
  const msg = (err?.message ?? '').toLowerCase();
  if (msg.includes('expired')) return 'expired';
  if (msg.includes('revoked') || msg.includes('no longer available'))
    return 'revoked';
  if (msg.includes('credit')) return 'credits';
  if (err?.status === 401) return 'invalid';
  return 'generic';
}

function toError(
  variant: CallSessionErrorVariant,
  t: (
    key:
      | 'expired.title'
      | 'expired.message'
      | 'revoked.title'
      | 'revoked.message'
      | 'credits.title'
      | 'credits.message'
      | 'completed.title'
      | 'completed.message'
      | 'invalid.title'
      | 'invalid.message'
      | 'generic.title'
      | 'generic.message'
  ) => string,
  fallbackMessage?: string
): CallSessionError {
  switch (variant) {
    case 'expired':
      return {
        title: t('expired.title'),
        message: t('expired.message'),
        variant
      };
    case 'revoked':
      return {
        title: t('revoked.title'),
        message: t('revoked.message'),
        variant
      };
    case 'credits':
      return {
        title: t('credits.title'),
        message: t('credits.message'),
        variant
      };
    case 'completed':
      return {
        title: t('completed.title'),
        message: t('completed.message'),
        variant
      };
    case 'invalid':
      return {
        title: t('invalid.title'),
        message: t('invalid.message'),
        variant
      };
    case 'generic':
    default:
      return {
        title: t('generic.title'),
        message: fallbackMessage || t('generic.message'),
        variant: 'generic'
      };
  }
}
