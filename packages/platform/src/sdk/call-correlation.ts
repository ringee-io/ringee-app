import { createHmac, timingSafeEqual } from "crypto";
import { deriveSdkKey } from "./secrets";

/**
 * Signed call-correlation token.
 *
 * An SDK call is created server-side (`authorize`) BEFORE the WebRTC leg is
 * placed, then the browser places the Telnyx call carrying this token in a
 * custom SIP header (`X-Ringee-Call-Id`). The Telnyx webhook uses it to adopt
 * the pre-created `Call` row. Because the header is browser-modifiable, it is
 * HMAC-signed so a client cannot adopt (or hijack) a `callId` it wasn't handed.
 *
 * Format: `<callId>.<base64url(hmac)>`
 */

function sign(callId: string): Buffer {
  return createHmac("sha256", deriveSdkKey("call_correlation"))
    .update(callId)
    .digest();
}

export function signCallCorrelation(callId: string): string {
  return `${callId}.${sign(callId).toString("base64url")}`;
}

/** Returns the callId when the token is authentic, else `null`. */
export function verifyCallCorrelation(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const callId = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = sign(callId);
    actual = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  return callId;
}
