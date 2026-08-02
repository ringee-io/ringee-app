import { RingeeError, toRingeeError } from "./errors";
import type { RingeeCallerId } from "./types";

/** Bootstrap payload returned by verify + restore. */
export interface BootstrapResponse {
  accessToken: string;
  expiresIn: number;
  agent: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    imageUrl: string | null;
    role: string | null;
  };
  workspace: { organizationId: string | null; name: string };
  permissions: { canCall: boolean; canRecord: boolean };
  callerIds: RingeeCallerId[];
  telnyxToken: {
    sipUsername: string;
    sipPassword: string;
    expiresAt: string;
    connectionId: string;
  };
}

export interface ChallengeResponse {
  challengeId: string;
  expiresIn: number;
  maskedEmail: string;
  resendAvailableIn: number;
}

export interface AuthorizeResponse {
  callId: string;
  destinationNumber: string;
  callerIdNumber: string;
  correlationToken: string;
  clientState: string;
}

export interface AuthorizeCallBody {
  to: string;
  callerIdId?: string;
  contactId?: string;
  externalContactId?: string;
  allowOverCap?: boolean;
}

const DEFAULT_API_URL = "https://api.ringee.io";
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Thin, typed transport to the Ringee SDK backend (`/api/v1/sdk/*`). The
 * browser sets `Origin` automatically (it cannot be forged from JS), so we only
 * attach the publishable key and, when present, the bearer session. Every
 * request has a timeout and maps failures to a typed {@link RingeeError}.
 */
export class ApiClient {
  private readonly baseUrl: string;

  constructor(
    private readonly publishableKey: string,
    apiUrl?: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.baseUrl = (apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  }

  initialize(): Promise<{
    ok: boolean;
    integrationId: string;
    workspace: string;
  }> {
    return this.post("/api/v1/sdk/initialize");
  }

  emailStart(email: string): Promise<ChallengeResponse> {
    return this.post("/api/v1/sdk/auth/email/start", { email });
  }

  emailVerify(challengeId: string, code: string): Promise<BootstrapResponse> {
    return this.post("/api/v1/sdk/auth/email/verify", { challengeId, code });
  }

  emailResend(challengeId: string): Promise<ChallengeResponse> {
    return this.post("/api/v1/sdk/auth/email/resend", { challengeId });
  }

  restore(sessionToken: string): Promise<BootstrapResponse> {
    return this.post("/api/v1/sdk/session/restore", undefined, {
      Authorization: `Bearer ${sessionToken}`,
    });
  }

  authorizeCall(
    sessionToken: string,
    body: AuthorizeCallBody,
    idempotencyKey: string,
  ): Promise<AuthorizeResponse> {
    return this.post("/api/v1/sdk/calls/authorize", body, {
      Authorization: `Bearer ${sessionToken}`,
      "Idempotency-Key": idempotencyKey,
    });
  }

  private async post<T>(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          "X-Ringee-Key": this.publishableKey,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error)?.name === "AbortError") {
        throw new RingeeError("TIMEOUT", "The request timed out.");
      }
      throw new RingeeError("NETWORK_ERROR", "Could not reach Ringee.");
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text().catch(() => "");
    const json = text ? safeParse(text) : undefined;

    if (!res.ok) {
      throw toRingeeError(json, `Request failed (${res.status}).`);
    }
    return json as T;
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
