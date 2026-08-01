import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Stable, browser-facing error codes for the Dialer SDK. These mirror the
 * `RingeeErrorCode` union the public SDK exposes, so a code returned by the
 * backend maps 1:1 to a `RingeeError` on the client. Never leak stack traces,
 * SQL, tokens or provider errors — only a code + a safe message.
 */
export type SdkErrorCode =
  | "INVALID_PUBLISHABLE_KEY"
  | "DOMAIN_NOT_ALLOWED"
  | "INTEGRATION_DISABLED"
  | "RATE_LIMITED"
  | "INVALID_EMAIL"
  | "EMAIL_CHALLENGE_EXPIRED"
  | "INVALID_EMAIL_CODE"
  | "EMAIL_CODE_ATTEMPTS_EXCEEDED"
  | "AGENT_NOT_ALLOWED"
  | "AGENT_NOT_IN_WORKSPACE"
  | "USER_BLOCKED"
  | "CALLING_DISABLED"
  | "SESSION_EXPIRED"
  | "AUTH_REQUIRED"
  | "NO_CALLER_ID"
  | "CALLER_ID_NOT_ALLOWED"
  | "INSUFFICIENT_CREDIT"
  | "DNC_BLOCKED"
  | "INVALID_PHONE_NUMBER"
  | "CALL_ALREADY_ACTIVE"
  | "NO_ACTIVE_CALL"
  | "UNKNOWN_ERROR";

const DEFAULT_STATUS: Record<SdkErrorCode, HttpStatus> = {
  INVALID_PUBLISHABLE_KEY: HttpStatus.UNAUTHORIZED,
  DOMAIN_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  INTEGRATION_DISABLED: HttpStatus.FORBIDDEN,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  INVALID_EMAIL: HttpStatus.BAD_REQUEST,
  EMAIL_CHALLENGE_EXPIRED: HttpStatus.GONE,
  INVALID_EMAIL_CODE: HttpStatus.BAD_REQUEST,
  EMAIL_CODE_ATTEMPTS_EXCEEDED: HttpStatus.TOO_MANY_REQUESTS,
  AGENT_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  AGENT_NOT_IN_WORKSPACE: HttpStatus.FORBIDDEN,
  USER_BLOCKED: HttpStatus.FORBIDDEN,
  CALLING_DISABLED: HttpStatus.FORBIDDEN,
  SESSION_EXPIRED: HttpStatus.UNAUTHORIZED,
  AUTH_REQUIRED: HttpStatus.UNAUTHORIZED,
  NO_CALLER_ID: HttpStatus.CONFLICT,
  CALLER_ID_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  INSUFFICIENT_CREDIT: HttpStatus.PAYMENT_REQUIRED,
  DNC_BLOCKED: HttpStatus.FORBIDDEN,
  INVALID_PHONE_NUMBER: HttpStatus.BAD_REQUEST,
  CALL_ALREADY_ACTIVE: HttpStatus.CONFLICT,
  NO_ACTIVE_CALL: HttpStatus.CONFLICT,
  UNKNOWN_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * An error whose JSON body is `{ code, message, statusCode }` — the same shape
 * the browser extension already consumes, so the SDK can map it to a typed
 * `RingeeError`.
 */
export class SdkError extends HttpException {
  constructor(
    readonly code: SdkErrorCode,
    message: string,
    status?: HttpStatus,
  ) {
    const statusCode = status ?? DEFAULT_STATUS[code];
    super({ code, message, statusCode }, statusCode);
  }
}
