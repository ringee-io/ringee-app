import { CrmError } from "../../errors";
import type { HubSpotErrorBody } from "./hubspot.types";

/**
 * Back-off for a 429 that carries no `Retry-After`, keyed by the policy
 * HubSpot reports as exhausted.
 */
const RATE_LIMIT_BACKOFF_MS: Record<string, number> = {
  SECONDLY: 1_000,
  TEN_SECONDLY_ROLLING: 10_000,
  DAILY: 60 * 60 * 1000,
};

/** HubSpot holds a `423 Locked` for two seconds. */
const LOCKED_BACKOFF_MS = 2_000;

/**
 * Maps a HubSpot error response to a `CrmError`.
 *
 * The generic HTTP mapping gets two HubSpot cases wrong, and both matter to
 * the connection's lifecycle:
 * - `403` means the token lacks a permission (a scope the portal did not
 *   grant, a feature its subscription does not include). The token still
 *   works, so this must not become `AUTH_REVOKED` — that would mark a healthy
 *   connection revoked the first time an optional feature is used.
 * - A revoked grant arrives from the OAuth endpoints as `400 invalid_grant`
 *   (legacy `status: "BAD_REFRESH_TOKEN"`). Reconnecting is the only fix, so
 *   it is terminal regardless of the status code.
 */
export function classifyHubSpotHttpError(
  status: number,
  body?: unknown,
  retryAfter?: string | null,
): CrmError {
  const b = asHubSpotErrorBody(body);
  const message = b.error_description ?? b.message;

  if (b.error === "invalid_grant" || b.status === "BAD_REFRESH_TOKEN") {
    return new CrmError(
      "AUTH_REVOKED",
      false,
      message ?? "refresh token is invalid, expired or revoked",
      undefined,
      body,
    );
  }

  switch (status) {
    case 401:
      // Expired (or unknown) access token — one refresh fixes the former.
      return new CrmError(
        "AUTH_EXPIRED",
        true,
        message ?? "unauthorized",
        undefined,
        body,
      );
    case 403:
      return new CrmError(
        "VALIDATION",
        false,
        message ?? "forbidden",
        undefined,
        body,
      );
    case 423:
      return new CrmError(
        "TRANSIENT",
        true,
        message ?? "locked",
        LOCKED_BACKOFF_MS,
        body,
      );
    case 429:
      return new CrmError(
        "RATE_LIMITED",
        true,
        message ?? "rate limited",
        parseRetryAfterMs(retryAfter) ??
          RATE_LIMIT_BACKOFF_MS[b.policyName ?? ""],
        body,
      );
  }

  const generic = CrmError.fromHttp(status, body, retryAfter);
  return new CrmError(
    generic.code,
    generic.retryable,
    message ?? generic.message,
    generic.retryAfterMs,
    body,
  );
}

/**
 * The id HubSpot names in a `409` for a contact that already exists
 * ("Contact already exists. Existing ID: 12345"). Two syncs racing to create
 * the same e-mail address land here; the loser adopts the winner's record.
 */
export function hubspotConflictExistingId(err: unknown): string | null {
  if (!(err instanceof CrmError) || err.code !== "CONFLICT") return null;
  const message = asHubSpotErrorBody(err.providerDetails).message ?? "";
  return /Existing ID:\s*(\d+)/i.exec(message)?.[1] ?? null;
}

/** Whether a validation error names the given property. */
export function isHubSpotPropertyRejection(
  err: unknown,
  property: string,
): boolean {
  if (!(err instanceof CrmError) || err.code !== "VALIDATION") return false;
  const details = err.providerDetails;
  if (typeof details === "string") return details.includes(property);
  try {
    return JSON.stringify(details ?? null).includes(property);
  } catch {
    return false;
  }
}

function asHubSpotErrorBody(body: unknown): HubSpotErrorBody {
  return body && typeof body === "object" ? (body as HubSpotErrorBody) : {};
}

function parseRetryAfterMs(value?: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
