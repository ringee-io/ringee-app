import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { deriveSdkKey } from "./secrets";

/**
 * Email OTP primitives for the SDK agent-authentication flow.
 *
 * The plaintext code is NEVER stored or logged. Redis holds only an HMAC of the
 * code (keyed by the SDK signing material) so a Redis dump cannot reveal codes.
 * Verification is constant-time.
 */

export const OTP_LENGTH = 6;

/** Cryptographically-random numeric code, zero-padded to {@link OTP_LENGTH}. */
export function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_LENGTH, "0");
}

/**
 * HMAC of an OTP, salted per challenge so identical codes across challenges
 * produce different hashes. `challengeId` is a natural per-challenge salt.
 */
export function hashOtp(code: string, challengeId: string): string {
  return createHmac("sha256", deriveSdkKey("agent_session"))
    .update(`${challengeId}:${code}`)
    .digest("hex");
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function verifyOtp(
  submittedCode: string,
  challengeId: string,
  storedHash: string,
): boolean {
  const computed = hashOtp(submittedCode, challengeId);
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** `ag***@company.com` — safe to return to the browser for UX. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? "*"}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}
