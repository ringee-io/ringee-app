import { createHmac, timingSafeEqual } from "crypto";
import { deriveSdkKey } from "./secrets";
import { normalizeAllowedOrigins } from "./origin";

/**
 * Publishable key (`pk_live_...`) for the Dialer SDK.
 *
 * Unlike the secret integration key (`cik_live_...`), the publishable key is
 * meant to sit in browser code. It is therefore NOT a secret — its security
 * comes entirely from being a Ringee-signed token whose claims cannot be
 * tampered with, combined with server-side origin + OTP + membership checks.
 *
 * Format: `pk_live_<base64url(payload)>.<base64url(hmacSha256)>`
 * The signature covers the payload bytes, so `integrationId`, `apiKeyPrefix`,
 * `allowedOrigins`, `type` and `version` are all immutable once signed.
 *
 * Revocation without storage:
 *   - the signed `apiKeyPrefix` is compared against the integration's CURRENT
 *     prefix on every verify, so rotating the secret key revokes every pk;
 *   - a disabled integration is rejected by the caller (status check).
 */

export const PUBLISHABLE_KEY_PREFIX = "pk_live_";

export interface PublishableKeyClaims {
  type: "ringee_publishable_key";
  version: 1;
  integrationId: string;
  /** Bound to CustomIntegration.apiKeyPrefix so key rotation revokes old pks. */
  apiKeyPrefix: string;
  allowedOrigins: string[];
  /** Unix seconds. */
  issuedAt: number;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payloadB64: string): Buffer {
  return createHmac("sha256", deriveSdkKey("publishable_key"))
    .update(payloadB64)
    .digest();
}

export interface MintPublishableKeyInput {
  integrationId: string;
  apiKeyPrefix: string;
  allowedOrigins: string[];
}

/** Create a signed publishable key. Throws if an origin is malformed. */
export function mintPublishableKey(input: MintPublishableKeyInput): {
  key: string;
  claims: PublishableKeyClaims;
} {
  const allowedOrigins = normalizeAllowedOrigins(input.allowedOrigins);
  const claims: PublishableKeyClaims = {
    type: "ringee_publishable_key",
    version: 1,
    integrationId: input.integrationId,
    apiKeyPrefix: input.apiKeyPrefix,
    allowedOrigins,
    issuedAt: Math.floor(Date.now() / 1000),
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
  const sig = b64url(sign(payloadB64));
  return { key: `${PUBLISHABLE_KEY_PREFIX}${payloadB64}.${sig}`, claims };
}

export type PublishableKeyError = "malformed" | "bad_signature" | "bad_claims";

export type PublishableKeyResult =
  | { ok: true; claims: PublishableKeyClaims }
  | { ok: false; error: PublishableKeyError };

/**
 * Verify a publishable key's format and HMAC signature and parse its claims.
 * This does NOT check the integration status or the request origin — the
 * service layer does that against the database and the `Origin` header.
 */
export function verifyPublishableKey(raw: unknown): PublishableKeyResult {
  if (typeof raw !== "string" || !raw.startsWith(PUBLISHABLE_KEY_PREFIX)) {
    return { ok: false, error: "malformed" };
  }
  const body = raw.slice(PUBLISHABLE_KEY_PREFIX.length);
  const dot = body.indexOf(".");
  if (dot <= 0 || dot === body.length - 1) {
    return { ok: false, error: "malformed" };
  }
  const payloadB64 = body.slice(0, dot);
  const sigB64 = body.slice(dot + 1);

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = sign(payloadB64);
    actual = Buffer.from(sigB64, "base64url");
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, error: "bad_signature" };
  }

  let claims: PublishableKeyClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as PublishableKeyClaims;
  } catch {
    return { ok: false, error: "bad_claims" };
  }
  if (
    claims?.type !== "ringee_publishable_key" ||
    claims.version !== 1 ||
    typeof claims.integrationId !== "string" ||
    typeof claims.apiKeyPrefix !== "string" ||
    !Array.isArray(claims.allowedOrigins)
  ) {
    return { ok: false, error: "bad_claims" };
  }
  return { ok: true, claims };
}
