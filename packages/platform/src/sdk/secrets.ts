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
  | "call_correlation"
  | "carrier_route"
  | "carrier_uac"
  | "dial_authorization"
  | "sse_ticket"
  | "media_stream";

const SALTS: Record<SdkKeyPurpose, string> = {
  publishable_key: "ringee_sdk_pk_v1",
  agent_session: "ringee_sdk_session_v1",
  call_correlation: "ringee_sdk_call_corr_v1",
  // Not an SDK token: the signed routing key of an external carrier
  // connection's Internal SIP URI. Same derivation, its own key.
  carrier_route: "ringee_carrier_route_v1",
  // Not an SDK token either: the provider-side (internal) credentials of an
  // external carrier connection, derived so they never need to be stored.
  carrier_uac: "ringee_carrier_uac_v1",
  // Not an SDK token: the authorization a dialer's pre-flight hands the
  // browser, which its WebRTC leg carries back to name who is paying.
  dial_authorization: "ringee_dial_authorization_v1",
  // Not an SDK token: the short-lived ticket an EventSource opens a stream
  // with, since it cannot send an Authorization header.
  sse_ticket: "ringee_sse_ticket_v1",
  // Not an SDK token: proves a media-stream connection is the one Ringee asked
  // the carrier to open for a call's realtime transcription.
  media_stream: "ringee_media_stream_v1",
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
