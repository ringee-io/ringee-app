import { scryptSync } from "crypto";

/**
 * Ringee Dialer SDK signing keys.
 *
 * The SDK signs two kinds of tokens with HMAC-SHA256:
 *   - the browser-safe publishable key (`pk_live_...`), and
 *   - the agent session token minted after an OTP is verified.
 *
 * Both keys are DERIVED from the existing `APP_ENCRYPTION_SECRET` with distinct,
 * hard-coded salts (domain separation) — exactly like `CryptoService` derives
 * its AES key from `ringee_salt_v1`. This means the SDK adds **no new required
 * env var**: rotating `APP_ENCRYPTION_SECRET` rotates every SDK key too. A
 * dedicated `SDK_SIGNING_SECRET` may optionally override the base secret if an
 * operator wants the SDK keys on a separate rotation schedule.
 */

export type SdkKeyPurpose =
  | "publishable_key"
  | "agent_session"
  | "call_correlation";

const SALTS: Record<SdkKeyPurpose, string> = {
  publishable_key: "ringee_sdk_pk_v1",
  agent_session: "ringee_sdk_session_v1",
  call_correlation: "ringee_sdk_call_corr_v1",
};

function baseSecret(): string {
  // Optional dedicated secret; falls back to the app-wide encryption secret so
  // no extra configuration is required to run the SDK. Read straight from the
  // environment (not `@ringee/configuration`) so the pure crypto stays
  // decoupled from the config bootstrap and is trivially unit-testable.
  const secret =
    process.env.SDK_SIGNING_SECRET || process.env.APP_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "APP_ENCRYPTION_SECRET (or SDK_SIGNING_SECRET) must be set to use the Dialer SDK",
    );
  }
  return secret;
}

/**
 * A 32-byte HMAC key for the given SDK token purpose, deterministically derived
 * from the base secret. Never expose or log the returned buffer.
 */
export function deriveSdkKey(purpose: SdkKeyPurpose): Buffer {
  return scryptSync(baseSecret(), SALTS[purpose], 32);
}
