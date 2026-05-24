import { createHash, randomBytes, timingSafeEqual } from "crypto";

const API_KEY_PREFIX = "cik_live_";
const SECRET_HEX_LENGTH = 64; // 32 random bytes → 64 hex chars
const PREVIEW_HEX_CHARS = 8;

export interface GeneratedApiKey {
  /** Full key — shown to the user once at create/rotate time. */
  plaintext: string;
  /** Public prefix safe to display in the UI (e.g. "cik_live_a1b2c3d4"). */
  prefix: string;
  /** SHA-256 hex of plaintext — store this in DB for constant-time lookup. */
  hash: string;
}

export function generateCustomIntegrationApiKey(): GeneratedApiKey {
  const secret = randomBytes(32).toString("hex");
  const plaintext = `${API_KEY_PREFIX}${secret}`;
  return {
    plaintext,
    prefix: `${API_KEY_PREFIX}${secret.slice(0, PREVIEW_HEX_CHARS)}`,
    hash: hashApiKey(plaintext),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function isValidApiKeyShape(value: string | undefined | null): value is string {
  if (!value) return false;
  if (!value.startsWith(API_KEY_PREFIX)) return false;
  return value.length === API_KEY_PREFIX.length + SECRET_HEX_LENGTH;
}

/** Constant-time hex compare for callers that want to verify hashes by hand. */
export function safeHashEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Plaintext form of the signing secret. Stored encrypted at rest. */
export function generateWebhookSigningSecret(): string {
  return `whsec_${randomBytes(32).toString("hex")}`;
}
