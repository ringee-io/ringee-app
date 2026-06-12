// Lightweight, fetch-based client for the public Call Session endpoints.
// All calls use a magic-link `token` for auth — there is no Clerk session.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export type ItemStatus =
  | 'pending'
  | 'calling'
  | 'completed'
  | 'skipped'
  | 'failed';

export type SessionStatus =
  | 'draft'
  | 'ready'
  | 'active'
  | 'paused'
  | 'completed'
  | 'expired'
  | 'revoked';

export type CallOutcome =
  | 'meeting_booked'
  | 'sale'
  | 'interested'
  | 'follow_up'
  | 'callback_scheduled'
  | 'not_interested'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number'
  | 'gatekeeper';

export interface SessionItemDto {
  id: string;
  displayName: string;
  company: string | null;
  phoneNumberMasked: string;
  /** Full E.164 phone number, sent to Telnyx WebRTC for dialing. */
  phoneNumber: string;
  status: ItemStatus;
  outcome: CallOutcome | null;
  positionIndex: number;
}

export interface SessionDto {
  id: string;
  title: string | null;
  expiresAt: string | null;
  status: SessionStatus;
  progress: { total: number; completed: number; remaining: number };
  items: SessionItemDto[];
}

export interface TelephonyCredential {
  sipUsername: string;
  sipPassword: string;
  expiresAt: string;
  connectionId: string;
}

export interface ValidateResponse {
  valid: boolean;
  creditsOk: boolean;
  creditBalance: number;
  callerIdNumber: string | null;
  /** True when the owner's workspace auto-records every call. */
  recordAllCalls: boolean;
  telephony: TelephonyCredential | null;
  session: SessionDto;
}

export interface CustomHeader {
  name: string;
  value: string;
}

export interface StartCallResponse {
  itemId: string;
  phoneNumber: string;
  callerIdNumber: string | null;
  customHeaders: CustomHeader[];
}

export interface CreditResponse {
  balance: number;
  creditsOk: boolean;
}

export class SessionApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'SessionApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    },
    cache: 'no-store'
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) {
        message =
          typeof body.message === 'string'
            ? body.message
            : Array.isArray(body.message)
              ? body.message.join(', ')
              : message;
      }
    } catch {
      // swallow JSON parse errors
    }
    throw new SessionApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export const sessionApi = {
  validate: (token: string) =>
    request<ValidateResponse>(
      `/call-sessions/join/validate?token=${encodeURIComponent(token)}`
    ),

  credit: (token: string) =>
    request<CreditResponse>(
      `/call-sessions/join/credit?token=${encodeURIComponent(token)}`
    ),

  startCall: (sessionId: string, itemId: string, token: string) =>
    request<StartCallResponse>(
      `/call-sessions/${sessionId}/items/${itemId}/start-call`,
      { method: 'POST', body: JSON.stringify({ token }) }
    ),

  endCall: (sessionId: string, itemId: string, token: string) =>
    request<{ itemId: string; callId: string | null }>(
      `/call-sessions/${sessionId}/items/${itemId}/end-call`,
      { method: 'POST', body: JSON.stringify({ token }) }
    ),

  saveOutcome: (
    sessionId: string,
    itemId: string,
    token: string,
    body: {
      outcome: CallOutcome;
      outcomeNote?: string | null;
      callbackAt?: string | null;
      meeting?: {
        scheduledAt: string;
        title?: string;
        duration?: number;
        location?: string;
        notes?: string;
        attendeeEmail?: string;
      } | null;
    }
  ) =>
    request<{
      itemId: string;
      callId: string | null;
      sessionCompleted: boolean;
      callbackId: string | null;
      meetingId: string | null;
    }>(`/call-sessions/${sessionId}/items/${itemId}/outcome`, {
      method: 'POST',
      body: JSON.stringify({ token, ...body })
    }),

  skip: (sessionId: string, itemId: string, token: string, reason?: string) =>
    request<{ itemId: string; sessionCompleted: boolean }>(
      `/call-sessions/${sessionId}/items/${itemId}/skip`,
      {
        method: 'POST',
        body: JSON.stringify({ token, reason: reason ?? null })
      }
    ),

  startRecording: (sessionId: string, itemId: string, token: string) =>
    request<{ recordingId: string; callId: string }>(
      `/call-sessions/${sessionId}/items/${itemId}/recording/start`,
      { method: 'POST', body: JSON.stringify({ token }) }
    ),

  stopRecording: (
    sessionId: string,
    itemId: string,
    token: string,
    recordingId: string
  ) =>
    request<{ recordingId: string }>(
      `/call-sessions/${sessionId}/items/${itemId}/recording/stop`,
      { method: 'POST', body: JSON.stringify({ token, recordingId }) }
    )
};
