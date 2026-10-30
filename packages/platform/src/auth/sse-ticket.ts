import { createHmac, timingSafeEqual } from "crypto";
import { deriveSdkKey } from "../sdk/secrets";
import type { OwnershipContext } from "./ownership.types";

/**
 * A short-lived ticket that opens one server-sent-event stream.
 *
 * `EventSource` cannot send an Authorization header, so a stream route is
 * public — and a stream id in the URL is an identifier, not a credential:
 * other members see conversation and session ids, and keep them after they
 * leave. The authenticated API issues this ticket after checking the caller
 * may read `subject`; the stream accepts it only for that subject, only for a
 * minute, and runs as the ownership context it names.
 *
 * Format: `<base64url(claims JSON)>.<base64url(HMAC-SHA256)>`.
 */
export const SSE_TICKET_TTL_MS = 60_000;

interface Claims {
  s: string;
  u: string;
  o: string | null;
  e: number;
}

function mac(payload: string): Buffer {
  return createHmac("sha256", deriveSdkKey("sse_ticket"))
    .update(payload)
    .digest();
}

export function signSseTicket(
  subject: string,
  ctx: OwnershipContext,
  options: { ttlMs?: number; now?: number } = {},
): string {
  const claims: Claims = {
    s: subject,
    u: ctx.userId,
    o: ctx.organizationId ?? null,
    e: (options.now ?? Date.now()) + (options.ttlMs ?? SSE_TICKET_TTL_MS),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${mac(payload).toString("base64url")}`;
}

/** The context the ticket names, when it is authentic, current and for `subject`. */
export function verifySseTicket(
  ticket: unknown,
  subject: string,
  now = Date.now(),
): OwnershipContext | null {
  // Reject malformed/oversized public input before touching key material.
  if (
    typeof ticket !== "string" ||
    ticket.length > 2048 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(ticket)
  )
    return null;
  const [payload, signature, extra] = ticket.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  let claims: Claims;
  try {
    const expected = mac(payload);
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (
    claims?.s !== subject ||
    typeof claims.u !== "string" ||
    !claims.u ||
    (claims.o !== null && typeof claims.o !== "string") ||
    typeof claims.e !== "number" ||
    claims.e <= now
  ) {
    return null;
  }
  return { userId: claims.u, organizationId: claims.o };
}
