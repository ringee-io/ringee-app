import { createHmac, timingSafeEqual } from "crypto";
import { deriveSdkKey } from "./secrets";

/**
 * SDK agent session token, minted after an email OTP is verified.
 *
 * This is a Ringee-signed bearer token (HMAC-SHA256) that binds a verified
 * agent to one integration, one workspace and one origin for ~8 hours. It is
 * stateless: `userId`, `organizationId`, `integrationId` and `origin` are all
 * signed and cannot be modified by the browser. Revocation of a still-valid
 * token (blocked user / disabled integration) is enforced by re-checking the
 * database on every privileged call — the signature alone is never sufficient.
 *
 * Format: `sdk_sess_<base64url(payload)>.<base64url(hmacSha256)>`
 */

export const SDK_SESSION_PREFIX = "sdk_sess_";
export const SDK_SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export interface SdkAgentSessionClaims {
  type: "ringee_sdk_agent_session";
  version: 1;
  integrationId: string;
  userId: string;
  organizationId?: string | null;
  email: string;
  origin: string;
  /** Unix seconds. */
  issuedAt: number;
  /** Unix seconds. */
  expiresAt: number;
}

function sign(payloadB64: string): Buffer {
  return createHmac("sha256", deriveSdkKey("agent_session"))
    .update(payloadB64)
    .digest();
}

export interface MintAgentSessionInput {
  integrationId: string;
  userId: string;
  organizationId?: string | null;
  email: string;
  origin: string;
  ttlSeconds?: number;
}

export function mintAgentSession(input: MintAgentSessionInput): {
  token: string;
  claims: SdkAgentSessionClaims;
} {
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? SDK_SESSION_TTL_SECONDS;
  const claims: SdkAgentSessionClaims = {
    type: "ringee_sdk_agent_session",
    version: 1,
    integrationId: input.integrationId,
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    email: input.email,
    origin: input.origin,
    issuedAt: now,
    expiresAt: now + ttl,
  };
  const payloadB64 = Buffer.from(JSON.stringify(claims), "utf8").toString(
    "base64url",
  );
  const sig = sign(payloadB64).toString("base64url");
  return { token: `${SDK_SESSION_PREFIX}${payloadB64}.${sig}`, claims };
}

export type SdkSessionError =
  | "malformed"
  | "bad_signature"
  | "bad_claims"
  | "expired";

export type SdkSessionResult =
  | { ok: true; claims: SdkAgentSessionClaims }
  | { ok: false; error: SdkSessionError };

export function verifyAgentSession(
  raw: unknown,
  now: number = Math.floor(Date.now() / 1000),
): SdkSessionResult {
  if (typeof raw !== "string" || !raw.startsWith(SDK_SESSION_PREFIX)) {
    return { ok: false, error: "malformed" };
  }
  const body = raw.slice(SDK_SESSION_PREFIX.length);
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

  let claims: SdkAgentSessionClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as SdkAgentSessionClaims;
  } catch {
    return { ok: false, error: "bad_claims" };
  }
  if (
    claims?.type !== "ringee_sdk_agent_session" ||
    claims.version !== 1 ||
    typeof claims.integrationId !== "string" ||
    typeof claims.userId !== "string" ||
    typeof claims.email !== "string" ||
    typeof claims.origin !== "string" ||
    typeof claims.expiresAt !== "number"
  ) {
    return { ok: false, error: "bad_claims" };
  }
  if (claims.expiresAt <= now) {
    return { ok: false, error: "expired" };
  }
  return { ok: true, claims };
}
