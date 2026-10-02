import { createHash, randomBytes, randomInt } from "crypto";

/**
 * Personal API keys authenticate a user on the agent surfaces (MCP endpoint and
 * the `ringee` CLI). The prefix is distinctive on purpose so secret scanners
 * and humans can recognize a leaked key at a glance.
 */
const PERSONAL_API_KEY_PREFIX = "ringee_sk_";
const SECRET_HEX_LENGTH = 64; // 32 random bytes → 64 hex chars
const PREVIEW_HEX_CHARS = 8;

export interface GeneratedPersonalApiKey {
  /** Full key — shown to the user once. */
  plaintext: string;
  /** Public prefix safe to display (e.g. "ringee_sk_a1b2c3d4"). */
  prefix: string;
  /** SHA-256 hex of the plaintext — the only form stored. */
  hash: string;
}

export function generatePersonalApiKey(): GeneratedPersonalApiKey {
  const secret = randomBytes(32).toString("hex");
  const plaintext = `${PERSONAL_API_KEY_PREFIX}${secret}`;
  return {
    plaintext,
    prefix: `${PERSONAL_API_KEY_PREFIX}${secret.slice(0, PREVIEW_HEX_CHARS)}`,
    hash: hashOpaqueSecret(plaintext),
  };
}

export function isPersonalApiKeyShape(
  value: string | undefined | null,
): value is string {
  if (!value || !value.startsWith(PERSONAL_API_KEY_PREFIX)) return false;
  return value.length === PERSONAL_API_KEY_PREFIX.length + SECRET_HEX_LENGTH;
}

/**
 * Digest for generated opaque secrets (API keys, device codes). They carry 256
 * bits of entropy, so a deterministic hash is safe and allows indexed lookup.
 */
export function hashOpaqueSecret(plaintext: string): string {
  // codeql[js/insufficient-password-hash]
  return createHash("sha256").update(plaintext).digest("hex");
}

// ── CLI device login (RFC 8628 shapes) ─────────────────────────────────────

/**
 * RFC 8628 §6.1: a base-20 alphabet of consonants avoids ambiguous characters
 * (0/O, 1/I) and cannot spell words, so the code reads cleanly aloud and on
 * screen. 8 characters ≈ 34 bits, ample for a 10-minute, single-use code.
 */
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const USER_CODE_LENGTH = 8;

/** "WDJB-MJHT" — shown in the terminal and confirmed in the browser. */
export function generateCliUserCode(): string {
  let raw = "";
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    raw += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * Canonical form of a user-typed code: upper-cased, separators dropped, dash
 * re-inserted. Returns null when it cannot be a code we issued.
 */
export function normalizeCliUserCode(
  input: string | undefined | null,
): string | null {
  if (!input) return null;
  const raw = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (raw.length !== USER_CODE_LENGTH) return null;
  for (const ch of raw) {
    if (!USER_CODE_ALPHABET.includes(ch)) return null;
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** The secret only the CLI holds; it polls with it to collect the key. */
export function generateCliDeviceCode(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString("base64url");
  return { plaintext, hash: hashOpaqueSecret(plaintext) };
}
