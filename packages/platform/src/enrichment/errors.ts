export type EnrichmentErrorCode =
  | "INVALID_CREDENTIALS"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "VALIDATION"
  | "PROVIDER_DOWN"
  | "TRANSIENT"
  | "UNKNOWN";

export class EnrichmentError extends Error {
  readonly name = "EnrichmentError";

  constructor(
    readonly code: EnrichmentErrorCode,
    readonly retryable: boolean,
    message?: string,
    readonly retryAfterMs?: number,
    readonly providerDetails?: unknown,
  ) {
    super(message ?? code);
  }

  static fromHttp(
    status: number,
    body?: unknown,
    retryAfter?: string | null,
  ): EnrichmentError {
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
    const detail = summarizeBody(body);
    if (status === 401)
      return new EnrichmentError(
        "INVALID_CREDENTIALS",
        false,
        detail ? `unauthorized — ${detail}` : "unauthorized",
        undefined,
        body,
      );
    if (status === 402)
      return new EnrichmentError(
        "QUOTA_EXCEEDED",
        false,
        detail
          ? `payment required / quota exceeded — ${detail}`
          : "payment required / quota exceeded",
        undefined,
        body,
      );
    if (status === 403)
      return new EnrichmentError(
        "INVALID_CREDENTIALS",
        false,
        detail ? `forbidden — ${detail}` : "forbidden",
        undefined,
        body,
      );
    if (status === 404)
      return new EnrichmentError(
        "NOT_FOUND",
        false,
        detail ? `not found — ${detail}` : "not found",
        undefined,
        body,
      );
    if (status === 422 || status === 400)
      return new EnrichmentError(
        "VALIDATION",
        false,
        detail ? `validation error — ${detail}` : "validation error",
        undefined,
        body,
      );
    if (status === 429)
      return new EnrichmentError(
        "RATE_LIMITED",
        true,
        "rate limited",
        retryAfterMs,
        body,
      );
    if (status >= 500 && status < 600)
      return new EnrichmentError(
        "PROVIDER_DOWN",
        true,
        `server ${status}`,
        undefined,
        body,
      );
    return new EnrichmentError(
      "UNKNOWN",
      false,
      detail ? `http ${status} — ${detail}` : `http ${status}`,
      undefined,
      body,
    );
  }
}

function summarizeBody(body: unknown): string | null {
  if (body == null) return null;
  try {
    if (typeof body === "string") {
      const trimmed = body.trim();
      return trimmed ? truncate(trimmed, 240) : null;
    }
    if (typeof body === "object") {
      const b = body as Record<string, unknown>;
      const msg =
        (typeof b.message === "string" && b.message) ||
        (typeof b.error === "string" && b.error) ||
        (typeof b.error_message === "string" && b.error_message) ||
        (typeof b.detail === "string" && b.detail) ||
        (typeof b.filter_error === "string" && b.filter_error);
      if (msg) return truncate(msg, 240);
      return truncate(JSON.stringify(body), 240);
    }
    return truncate(String(body), 240);
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
