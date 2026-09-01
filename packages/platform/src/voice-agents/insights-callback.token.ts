import { createHmac, scryptSync, timingSafeEqual } from "crypto";

/**
 * The proof an analysis callback carries.
 *
 * Post-call analysis is delivered to a URL the provider stores against the
 * agent's insight group — a URL, and nothing else: there are no headers to set
 * and no signature Ringee can pin to the group. So the URL itself carries the
 * proof, exactly as the per-call status callback does, and the route verifies
 * it before writing anything.
 *
 * The token is derived rather than stored: one HMAC over the agent id under a
 * key scrypt'd from `APP_ENCRYPTION_SECRET` with its own salt, the same
 * domain-separated derivation the Dialer SDK uses for its own tokens. That
 * means no column, no plaintext at rest, a URL that is stable across saves,
 * and rotation that follows the app secret.
 */

const SALT = "ringee_voice_agent_insights_v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  // Read straight from the environment rather than `@ringee/configuration`,
  // exactly as `sdk/secrets.ts` does: it keeps the pure crypto decoupled from
  // the config bootstrap and unit-testable without it.
  const secret = process.env.APP_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "APP_ENCRYPTION_SECRET must be set to sign voice agent analysis callbacks",
    );
  }
  // scrypt is deliberately slow, and this runs on every save and every
  // delivery — derive once per process.
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** The token to put in an agent's analysis callback URL. */
export function voiceAgentInsightsToken(agentId: string): string {
  return createHmac("sha256", key()).update(agentId).digest("hex");
}

/**
 * Whether a token really is this agent's. Constant-time, and false for
 * anything malformed — a caller must not be able to tell "wrong agent" from
 * "wrong token".
 */
export function voiceAgentInsightsTokenMatches(
  agentId: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const expected = Buffer.from(voiceAgentInsightsToken(agentId), "hex");
  const received = Buffer.from(token, "hex");
  if (received.length !== expected.length) return false;
  return timingSafeEqual(expected, received);
}
