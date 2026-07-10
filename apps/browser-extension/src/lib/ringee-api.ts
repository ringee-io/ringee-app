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
  /** E.164 the user picked to call from; the backend uses it only if still valid. */
  preferredCallerId?: string;
}

/** One outbound number the user may call from (picker in the panel header). */
export interface WorkspaceNumber {
  id: string;
  phoneNumber: string; // E.164
  isoCountry: string;
  kind: "purchased" | "verified_caller_id" | string;
  verified: boolean;
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
  firstName?: string | null;
  workspaceName?: string;
  /**
   * Mirrors the backend `OrgAdminGuard` rule (no org → true; inside an org only
   * `org:admin`). Drives whether the side panel shows the credit balance and the
   * "Add credits" entry point.
   */
  isAdmin?: boolean;
}

// ── Contacts / CRM ─────────────────────────────────────────────────────────
export interface ContactSummary {
  id: string;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  phoneNumber: string;
  email?: string | null;
  jobTitle?: string | null;
  lastContactedAt?: string | null;
}

export interface ContactNote {
  id: string;
  contactId?: string;
  content: string;
  createdAt: string;
}

export interface CallFull {
  id: string;
  contactId?: string | null;
  contactName?: string | null;
  contactCompany?: string | null;
  phoneNumber?: string;
  fromNumber: string;
  toNumber: string;
  direction: string | null;
  status: string;
  durationSeconds?: number | null;
  startedAt?: string | null;
  outcome?: CallOutcome | null;
  outcomeNote?: string | null;
  hasRecording?: boolean;
  recordingUrl?: string | null;
  hasTranscription?: boolean;
  notes?: { id: string; content: string; createdAt: string }[];
}

export interface Callback {
  id: string;
  contactId: string;
  contactName?: string | null;
  contactCompany?: string | null;
  phoneNumber?: string | null;
  scheduledAt: string;
  status: string;
  note?: string | null;
}

export interface Meeting {
  id: string;
  title?: string | null;
  contactId: string;
  contactName?: string | null;
  contactCompany?: string | null;
  scheduledAt: string;
  duration: number;
  location?: string | null;
  notes?: string | null;
  status: string;
  meetingUrl?: string | null;
}

export interface ContactDetail extends ContactSummary {
  recentCalls: CallFull[];
  notes: ContactNote[];
  upcomingCallback: Callback | null;
  upcomingMeeting: Meeting | null;
}

/** Create/update payload — mirrors the backend `CreateContactDto`. */
export interface ContactInput {
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber: string;
  email?: string;
  jobTitle?: string;
  organization?: string;
  note?: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
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

/**
 * Supplies the Clerk JWT for a request. `forceRefresh` skips Clerk's in-memory
 * token cache — the short-lived session JWT (~60s) goes stale while the side
 * panel sits open, and a cached-but-expired token is exactly what makes the
 * backend answer 401 ("de-authenticated, can't fetch data"). We retry those
 * once with a freshly-minted token before surfacing the error.
 */
type TokenProvider = (opts?: {
  forceRefresh?: boolean;
}) => Promise<string | null>;

export class RingeeApi {
  constructor(private readonly getToken: TokenProvider) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res = await this.fetchWithToken(path, init, false);
    // Stale Clerk JWT → force a refresh and try once more before giving up. This
    // is the single most common cause of the panel "losing" auth mid-session.
    if (res.status === 401) {
      res = await this.fetchWithToken(path, init, true);
    }
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

  private async fetchWithToken(
    path: string,
    init: RequestInit | undefined,
    forceRefresh: boolean,
  ): Promise<Response> {
    const token = await this.getToken({ forceRefresh }).catch(() => null);
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  }

  /** Backend-gated pre-call: validate → workspace → credits → DNC → caller ID → contact → creds. */
  prepareCall(input: PrepareCallRequest) {
    return this.request<PrepareCallResponse>("/extension/prepare-call", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** The outbound numbers the user may call from — powers the "Call from" picker. */
  listNumbers() {
    return this.request<{ numbers: WorkspaceNumber[] }>("/extension/numbers");
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

  /**
   * Finalize a call closed without an outcome (Skip / close) so its CRM note
   * fires now instead of waiting out the hangup grace window.
   */
  finalizeCall(input: { callId: string }) {
    return this.request<void>(
      `/mobile/calls/${encodeURIComponent(input.callId)}/finalize`,
      { method: "POST" },
    );
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

  // ── Credit (admin only) ────────────────────────────────────────────────
  /** Workspace balance — backend is `@OrgAdminOnly()` (403 for org members). */
  getCredit() {
    return this.request<{ balance: number }>("/extension/credit");
  }

  /** Start a Stripe one-time credit checkout; returns the hosted-page URL. */
  createCreditCheckout(amount: number) {
    return this.request<{ url: string }>("/stripe/checkout/credit", {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
  }

  // ── Contacts ───────────────────────────────────────────────────────────
  listContacts(params: { search?: string; page?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return this.request<Paginated<ContactSummary>>(
      `/mobile/contacts${q ? `?${q}` : ""}`,
    );
  }

  searchContacts(query: string, limit = 20) {
    const qs = new URLSearchParams({ q: query, limit: String(limit) });
    return this.request<{ data: ContactSummary[]; total: number }>(
      `/mobile/contacts/search?${qs.toString()}`,
    );
  }

  /** Full contact: recent calls, notes, upcoming callback + meeting. */
  getContact(id: string) {
    return this.request<ContactDetail>(
      `/mobile/contacts/${encodeURIComponent(id)}`,
    );
  }

  createContact(input: ContactInput) {
    return this.request<{ id: string }>("/contacts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateContact(id: string, input: ContactInput) {
    return this.request<{ id: string }>(`/contacts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  addContactNote(id: string, content: string) {
    return this.request<void>(
      `/mobile/contacts/${encodeURIComponent(id)}/notes`,
      { method: "POST", body: JSON.stringify({ content }) },
    );
  }

  // ── Calls ──────────────────────────────────────────────────────────────
  /** Full call detail (recording url, outcome, notes). */
  getCallFull(id: string) {
    return this.request<CallFull>(`/mobile/calls/${encodeURIComponent(id)}`);
  }

  setCallOutcome(
    id: string,
    input: { outcome: CallOutcome; outcomeNote?: string },
  ) {
    return this.request<void>(
      `/mobile/calls/${encodeURIComponent(id)}/outcome`,
      {
        method: "POST",
        body: JSON.stringify({
          outcome: input.outcome,
          outcomeNote: input.outcomeNote || undefined,
        }),
      },
    );
  }

  addCallNote(id: string, content: string) {
    return this.request<void>(`/mobile/calls/${encodeURIComponent(id)}/notes`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  // ── Callbacks ──────────────────────────────────────────────────────────
  rescheduleCallback(id: string, scheduledAt: string) {
    return this.request<void>(
      `/callbacks/${encodeURIComponent(id)}/reschedule`,
      { method: "PATCH", body: JSON.stringify({ scheduledAt }) },
    );
  }

  cancelCallback(id: string) {
    return this.request<void>(`/callbacks/${encodeURIComponent(id)}/cancel`, {
      method: "PATCH",
    });
  }

  // ── Meetings ───────────────────────────────────────────────────────────
  getMeeting(id: string) {
    return this.request<Meeting>(`/meetings/${encodeURIComponent(id)}`);
  }

  cancelMeeting(id: string) {
    return this.request<void>(`/meetings/${encodeURIComponent(id)}/cancel`, {
      method: "PATCH",
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
