import { createHmac, timingSafeEqual } from "crypto";

export interface SignedRequest {
  /** Value of the `Ringee-Signature` header. */
  signatureHeader: string;
  /** Value of the `Ringee-Timestamp` header (unix seconds, as string). */
  timestampHeader: string;
  /** Hex digest of the HMAC for the body. */
  signature: string;
}

/**
 * Sign an outbound webhook body. Format mirrors Stripe / Telnyx style:
 *   Ringee-Signature: t=<unixSec>,v1=<hex>
 *   Ringee-Timestamp: <unixSec>
 *
 * Verifier must recompute `HMAC_SHA256(secret, "<timestamp>.<body>")` and
 * compare in constant time.
 */
export function signOutboundEvent(body: string, secret: string, now: Date = new Date()): SignedRequest {
  const timestamp = Math.floor(now.getTime() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return {
    signatureHeader: `t=${timestamp},v1=${signature}`,
    timestampHeader: timestamp,
    signature,
  };
}

/** Helper exported for documentation snippets / tests. */
export function verifyOutboundSignature(
  body: string,
  secret: string,
  timestamp: string,
  signature: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}
