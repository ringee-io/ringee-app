/**
 * Thin client over the Ringee backend (NestJS). The extension performs NO
 * business logic itself — it asks the backend to prepare a call, and the
 * backend validates the user, resolves the active workspace, checks
 * permissions + credits + DNC, resolves the caller ID, finds/creates the
 * contact, and returns the (ephemeral) WebRTC credentials. Nothing sensitive
 * (caller IDs, SIP creds) is ever hardcoded here.
 *
 * Auth is a Clerk JWT (`Authorization: Bearer <token>`), identical to the web
 * app's ApiClient.
 */
import type {
  CallOutcome,
  PageOrigin,
  TelephonyCredential,
} from "@ringee/dialer-core/contracts";

const API_URL =
  import.meta.env.VITE_RINGEE_API_URL ?? "https://api.ringee.io/api";

export interface PrepareCallRequest {
  destination: string; // E.164
  name?: string;
  company?: string;
  origin?: PageOrigin;
}

export interface PrepareCallResponse {
  /** Backend call/attempt id, when one is created up front. */
  callId: string | null;
  contact: { id: string; name?: string; company?: string };
  /** Resolved server-side from workspace/user/org — never a literal. */
  callerId: string;
  credential: TelephonyCredential;
  destination: string;
}

/** Stable error codes the backend returns so the side panel can show the right state. */
export type PrepareCallErrorCode =
  | "UNAUTHENTICATED"
  | "NO_WORKSPACE"
  | "NO_CALLER_ID"
  | "INSUFFICIENT_CREDITS"
  | "DNC_BLOCKED"
  | "FORBIDDEN"
  | "CONTACT_FAILED"
  | "UNKNOWN";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: PrepareCallErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface CurrentUser {
  id: string;
  email?: string;
  firstName?: string;
  workspaceName?: string;
}

// ── "Today" home feed ─────────────────────────────────────────────────────────
export interface TodayCallbackItem {
  id: string;
  contactId: string | null;
  contactName: string | null;
  phone: string | null;
  scheduledAt: string;
  status: string;
  note: string | null;
}

export interface TodayCallItem {
  id: string;
  toNumber: string;
  fromNumber: string;
  direction: string;
  contactId: string | null;
  contactName: string | null;
  status: string;
  outcome: string | null;
  outcomeNote: string | null;
  durationSeconds: number | null;
  createdAt: string;
  hasRecording: boolean;
  hasTranscription: boolean;
}

export interface TodayMeetingItem {
  id: string;
  title: string | null;
  contactName: string | null;
  phone: string | null;
  scheduledAt: string;
  location: string | null;
  status: string;
}

export interface TodayData {
  callbacks: TodayCallbackItem[];
  calls: TodayCallItem[];
  meetings: TodayMeetingItem[];
}

export interface CallDetail {
  callId: string;
  recording: {
    url: string | null;
    durationSec: number | null;
    format: string | null;
  } | null;
  transcript: {
    text: string;
    segments: Array<{
      text: string;
      speaker: number | null;
      startMs: number | null;
    }>;
  } | null;
}

type TokenProvider = () => Promise<string | null>;

export class RingeeApi {
  constructor(private readonly getToken: TokenProvider) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      let code: PrepareCallErrorCode = "UNKNOWN";
      let message = res.statusText;
      try {
        const body = await res.json();
        code =
          (body?.code as PrepareCallErrorCode) ??
          mapStatusToErrorCode(res.status);
        message = body?.message ?? message;
      } catch {
        code = mapStatusToErrorCode(res.status);
      }
      throw new ApiError(res.status, code, message);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  /** Backend-gated pre-call: validate → workspace → credits → DNC → caller ID → contact → creds. */
  prepareCall(input: PrepareCallRequest) {
    return this.request<PrepareCallResponse>("/extension/prepare-call", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** Identity / active workspace for the side-panel header. */
  getCurrentUser() {
    return this.request<CurrentUser>("/extension/me");
  }

  /**
   * The "Today" home feed: today's callbacks, calls and meetings. We pass the
   * browser's local midnight boundaries so "today" matches the user's timezone.
   */
  getToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const qs = `?from=${encodeURIComponent(
      start.toISOString(),
    )}&to=${encodeURIComponent(end.toISOString())}`;
    return this.request<TodayData>(`/extension/today${qs}`);
  }

  /** Recording + transcript detail for one recent call. */
  getCallDetail(callId: string) {
    return this.request<CallDetail>(
      `/extension/calls/${encodeURIComponent(callId)}`,
    );
  }

  /** Persist disposition + note after the call (same endpoint the web app uses). */
  saveCallOutcome(input: {
    callId?: string | null;
    callSessionId?: string | null;
    outcome: CallOutcome;
    outcomeNote?: string;
  }) {
    return this.request<void>("/meetings/call-outcome", {
      method: "POST",
      body: JSON.stringify({
        callId: input.callId || undefined,
        callSessionId: input.callSessionId || undefined,
        outcome: input.outcome,
        outcomeNote: input.outcomeNote || undefined,
      }),
    });
  }

  /** Book a meeting against a contact (same endpoint + shape the web app uses). */
  bookMeeting(input: {
    contactId: string;
    callId?: string | null;
    scheduledAt: string;
    duration: number;
    attendeeEmail?: string;
  }) {
    return this.request<{ id: string }>("/meetings", {
      method: "POST",
      body: JSON.stringify({
        contactId: input.contactId,
        callId: input.callId || undefined,
        scheduledAt: input.scheduledAt,
        duration: input.duration,
        attendeeEmail: input.attendeeEmail || undefined,
      }),
    });
  }

  /** Mark a callback as completed (used when the user dials it from Today). */
  completeCallback(id: string) {
    return this.request<void>(`/callbacks/${encodeURIComponent(id)}/complete`, {
      method: "PATCH",
    });
  }

  /** Schedule a callback against a contact (same endpoint the web app uses). */
  scheduleCallback(input: {
    contactId: string;
    callId?: string | null;
    scheduledAt: string;
    note?: string;
  }) {
    return this.request<{ id: string }>("/callbacks", {
      method: "POST",
      body: JSON.stringify({
        contactId: input.contactId,
        callId: input.callId || undefined,
        scheduledAt: input.scheduledAt,
        note: input.note || undefined,
      }),
    });
  }

  startRecording(callSessionId: string) {
    return this.request<{ id: string }>("/telephony/recordings/start", {
      method: "POST",
      body: JSON.stringify({ callSessionId }),
    });
  }

  stopRecording(recordingId: string, callSessionId: string) {
    return this.request<void>("/telephony/recordings/stop", {
      method: "POST",
      body: JSON.stringify({ recordingId, callSessionId }),
    });
  }
}

/** Map an HTTP status to a stable prepare-call error code (when the body has none). */
export function mapStatusToErrorCode(status: number): PrepareCallErrorCode {
  switch (status) {
    case 401:
      return "UNAUTHENTICATED";
    case 402:
      return "INSUFFICIENT_CREDITS";
    case 403:
      return "FORBIDDEN";
    case 409:
      return "NO_CALLER_ID";
    default:
      return "UNKNOWN";
  }
}
