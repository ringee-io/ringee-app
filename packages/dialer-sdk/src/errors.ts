import type { RingeeErrorCode, RingeeErrorLike } from "./types";

/** Error codes that are worth retrying without user intervention. */
const RETRYABLE: ReadonlySet<RingeeErrorCode> = new Set([
  "RATE_LIMITED",
  "TELNYX_CONNECTION_FAILED",
  "NETWORK_ERROR",
  "TIMEOUT",
]);

/**
 * The single error type the SDK throws and emits. It never carries a backend
 * stack trace, SQL, token, or raw Telnyx/Clerk error — only a stable `code`, a
 * safe `message`, and optional non-sensitive `details`.
 */
export class RingeeError extends Error implements RingeeErrorLike {
  readonly code: RingeeErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: RingeeErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RingeeError";
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    this.details = details;
    // Restore the prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, RingeeError.prototype);
  }

  toJSON(): RingeeErrorLike {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

const KNOWN_CODES = new Set<string>([
  "INVALID_PUBLISHABLE_KEY",
  "DOMAIN_NOT_ALLOWED",
  "INTEGRATION_DISABLED",
  "RATE_LIMITED",
  "INVALID_EMAIL",
  "EMAIL_CHALLENGE_EXPIRED",
  "INVALID_EMAIL_CODE",
  "EMAIL_CODE_ATTEMPTS_EXCEEDED",
  "AGENT_NOT_ALLOWED",
  "AGENT_NOT_IN_WORKSPACE",
  "USER_BLOCKED",
  "CALLING_DISABLED",
  "SESSION_EXPIRED",
  "SDK_NOT_INITIALIZED",
  "AUTH_REQUIRED",
  "MICROPHONE_DENIED",
  "NO_AUDIO_DEVICE",
  "AUDIO_PLAYBACK_BLOCKED",
  "NO_CALLER_ID",
  "CALLER_ID_NOT_ALLOWED",
  "INSUFFICIENT_CREDIT",
  "DNC_BLOCKED",
  "INVALID_PHONE_NUMBER",
  "CALL_ALREADY_ACTIVE",
  "NO_ACTIVE_CALL",
  "INVALID_CALL_STATE",
  "TELNYX_CONNECTION_FAILED",
  "CALL_FAILED",
  "NETWORK_ERROR",
  "TIMEOUT",
  "UNKNOWN_ERROR",
]);

/**
 * Map an arbitrary backend error body `{ code, message }` to a typed
 * {@link RingeeError}, falling back to `UNKNOWN_ERROR` for anything unexpected.
 */
export function toRingeeError(
  body: unknown,
  fallbackMessage = "Something went wrong.",
): RingeeError {
  if (body instanceof RingeeError) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const rawCode = typeof record.code === "string" ? record.code : "";
  const code = (
    KNOWN_CODES.has(rawCode) ? rawCode : "UNKNOWN_ERROR"
  ) as RingeeErrorCode;
  const message =
    typeof record.message === "string" && record.message
      ? record.message
      : fallbackMessage;
  return new RingeeError(code, message);
}
