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
    if (status === 401)
      return new EnrichmentError(
        "INVALID_CREDENTIALS",
        false,
        "unauthorized",
        undefined,
        body,
      );
    if (status === 402)
      return new EnrichmentError(
        "QUOTA_EXCEEDED",
        false,
        "payment required / quota exceeded",
        undefined,
        body,
      );
    if (status === 403)
      return new EnrichmentError(
        "INVALID_CREDENTIALS",
        false,
        "forbidden",
        undefined,
        body,
      );
    if (status === 404)
      return new EnrichmentError(
        "NOT_FOUND",
        false,
        "not found",
        undefined,
        body,
      );
    if (status === 422 || status === 400)
      return new EnrichmentError(
        "VALIDATION",
        false,
        "validation error",
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
      `http ${status}`,
      undefined,
      body,
    );
  }
}
