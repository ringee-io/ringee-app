export type CrmErrorCode =
  | "AUTH_EXPIRED"
  | "AUTH_REVOKED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "TRANSIENT"
  | "PROVIDER_UNAVAILABLE"
  | "UNKNOWN";

export class CrmError extends Error {
  readonly name = "CrmError";

  constructor(
    readonly code: CrmErrorCode,
    readonly retryable: boolean,
    message?: string,
    readonly retryAfterMs?: number,
    readonly providerDetails?: unknown,
  ) {
    super(message ?? code);
  }

  static fromHttp(status: number, body?: unknown, retryAfter?: string | null): CrmError {
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
    if (status === 401) return new CrmError("AUTH_EXPIRED", true, "unauthorized", undefined, body);
    if (status === 403) return new CrmError("AUTH_REVOKED", false, "forbidden", undefined, body);
    if (status === 404) return new CrmError("NOT_FOUND", false, "not found", undefined, body);
    if (status === 409) return new CrmError("CONFLICT", false, "conflict", undefined, body);
    if (status === 422 || status === 400) return new CrmError("VALIDATION", false, "validation error", undefined, body);
    if (status === 429) return new CrmError("RATE_LIMITED", true, "rate limited", retryAfterMs, body);
    if (status >= 500 && status < 600) return new CrmError("TRANSIENT", true, `server ${status}`, undefined, body);
    return new CrmError("UNKNOWN", false, `http ${status}`, undefined, body);
  }

  static auth(message = "authentication failed"): CrmError {
    return new CrmError("AUTH_REVOKED", false, message);
  }
}
