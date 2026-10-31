import { createHmac, timingSafeEqual } from "crypto";
import { deriveSdkKey } from "../sdk/secrets";

/**
 * The authorization a dialer's pre-flight issues for one outbound leg.
 *
 * A browser places its WebRTC leg itself, and the provider reports it with
 * whatever SIP headers the browser chose — so a user/organization header is a
 * claim, not proof. This token is the proof: the authenticated pre-flight signs
 * who is calling, for which workspace, and which number, and the leg carries it
 * back in {@link DIAL_AUTHORIZATION_HEADER}.
 *
 * Format: `v1.<base64url(claims JSON)>.<base64url(HMAC-SHA256)>`.
 */
export const DIAL_AUTHORIZATION_HEADER = "X-Ringee-Dial-Token";

/** How long a pre-flight's authorization waits for its leg. */
export const DIAL_AUTHORIZATION_TTL_MS = 5 * 60_000;

export interface DialAuthorization {
  /** Ringee user id. */
  userId: string;
  /** Ringee organization id; `null` for the personal workspace. */
  organizationId: string | null;
  /** Digits of the number the pre-flight authorized. */
  destination: string;
  /**
   * Digits of the caller ID the pre-flight chose for the leg — with its
   * user/surface restrictions already applied — or `null` when it bound none.
   */
  callerId: string | null;
  /** Epoch ms after which the token admits no leg. */
  expiresAt: number;
}

interface Claims {
  u: string;
  o: string | null;
  d: string;
  c?: string | null;
  e: number;
}

/** A phone number's digits — how a token names its destination. */
export function dialDestinationDigits(
  value: string | null | undefined,
): string {
  return (value ?? "").replace(/\D/g, "");
}

function mac(payload: string): Buffer {
  return createHmac("sha256", deriveSdkKey("dial_authorization"))
    .update(`v1.${payload}`)
    .digest();
}

export function signDialAuthorization(
  claims: {
    userId: string;
    organizationId: string | null;
    destination: string;
    callerId?: string | null;
  },
  options: { ttlMs?: number; now?: number } = {},
): string {
  const callerId = dialDestinationDigits(claims.callerId);
  const body: Claims = {
    u: claims.userId,
    o: claims.organizationId,
    d: dialDestinationDigits(claims.destination),
    c: callerId || null,
    e:
      (options.now ?? Date.now()) +
      (options.ttlMs ?? DIAL_AUTHORIZATION_TTL_MS),
  };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `v1.${payload}.${mac(payload).toString("base64url")}`;
}

/** The authorization when the token is authentic and unexpired, else `null`. */
export function verifyDialAuthorization(
  token: unknown,
  now = Date.now(),
): DialAuthorization | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, payload, signature] = parts;
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
    typeof claims?.u !== "string" ||
    !claims.u ||
    (claims.o !== null && typeof claims.o !== "string") ||
    typeof claims.d !== "string" ||
    (claims.c != null && typeof claims.c !== "string") ||
    typeof claims.e !== "number" ||
    claims.e <= now
  ) {
    return null;
  }
  return {
    userId: claims.u,
    organizationId: claims.o,
    destination: claims.d,
    callerId: claims.c ?? null,
    expiresAt: claims.e,
  };
}
