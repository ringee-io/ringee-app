import {
  allowedFactProperties,
  type BackendAnalyticsFact,
} from "./event-contract";

/**
 * What leaves Ringee for the analytics provider is sanitized here first:
 * properties, error messages, nested causes and stack traces. The rules are
 * deliberately blunt — over-redacting a diagnostic is cheap, leaking a
 * contact's number or a token is not (SECURITY.md, "Logs and emails carry no
 * secrets").
 *
 * Every scan is linear in its (capped) input: no regular expression with
 * overlapping repetition runs on untrusted text (SECURITY.md rule 12).
 */

export type AnalyticsPropertyValue = string | number | boolean | null;

/** A redacted error, safe to export: no message is sent unredacted. */
export interface SanitizedError {
  type: string;
  message: string;
  code: string;
  cause?: SanitizedError;
}

const MAX_TEXT_LENGTH = 300;
/** Work is bounded before any scan: longer input is cut, not parsed. */
const MAX_SCANNED_LENGTH = 4_000;
const MAX_STACK_LINES = 40;
const MAX_CAUSE_DEPTH = 3;
const MAX_STRING_PROPERTY = 64;
const MAX_LIST_ITEMS = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_PREFIXES = [
  "ringee_sk_",
  "cik_live_",
  "whsec_",
  "pk_live_",
  "pk_test_",
  "sk_live_",
  "sk_test_",
  "rk_live_",
  "phc_",
  "phx_",
  "phs_",
  "key_",
  "xoxb-",
  "ghp_",
  "AKIA",
];
const SENSITIVE_KEYS = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "auth",
  "signature",
  "sig",
  "otp",
  "code",
  "session",
  "cookie",
  "email",
  "phone",
  "phonenumber",
  "to",
  "from",
];
/** Query parameters that may stay on a URL: campaign attribution only. */
const ALLOWED_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "ref",
]);

const QUOTE_PAIRS: Record<string, string> = {
  '"': '"',
  "“": "”",
  "«": "»",
  "‘": "’",
};

/**
 * Redacts what may identify a person or grant access in free text: anything
 * quoted (Ringee's own messages quote user-provided names and titles),
 * emails, phone-like digit runs, URLs beyond their host, secrets with a known
 * shape, long opaque tokens and `key=value` pairs with a sensitive key. Opaque
 * UUIDs are kept: they are correlation ids, not personal data.
 */
export function redactSensitiveText(
  input: unknown,
  maxLength = MAX_TEXT_LENGTH,
): string {
  if (input === null || input === undefined) return "";
  let text = String(input);
  if (text.length > MAX_SCANNED_LENGTH)
    text = text.slice(0, MAX_SCANNED_LENGTH);

  text = redactQuoted(text);

  const protectedIds: string[] = [];
  const tokens = text.split(/(\s+)/);
  let afterAuthScheme = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (!token || /^\s+$/.test(token)) continue;
    if (afterAuthScheme) {
      // "Bearer <credential>" / "Basic <credential>": whatever its shape.
      tokens[i] = "[secret]";
      afterAuthScheme = false;
      continue;
    }
    const lower = token.toLowerCase();
    afterAuthScheme = lower === "bearer" || lower === "basic";
    tokens[i] = redactToken(token, protectedIds);
  }
  text = redactPhoneRuns(tokens.join(""));
  // Restore the protected ids once digit runs can no longer touch them.
  text = text.replace(/\uE000(\d+)\uE001/g, (_, index: string) => {
    return protectedIds[Number(index)] ?? "";
  });
  return truncate(text, maxLength);
}

function redactQuoted(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const close = QUOTE_PAIRS[ch];
    const isSingle = ch === "'";
    const opensSingle = isSingle && (i === 0 || /[\s([{:=]/.test(text[i - 1]!));
    if (close || opensSingle) {
      const closing = close ?? "'";
      const end = text.indexOf(closing, i + 1);
      if (end > i && end - i <= 200) {
        out += `${ch}…${closing}`;
        i = end + 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

function redactToken(raw: string, protectedIds: string[]): string {
  // Classify the token without its surrounding punctuation, then put it back.
  let start = 0;
  let end = raw.length;
  while (start < end && "([{<".includes(raw[start]!)) start += 1;
  while (end > start && ".,;:!?)]}>".includes(raw[end - 1]!)) end -= 1;
  const lead = raw.slice(0, start);
  const core = raw.slice(start, end);
  const trail = raw.slice(end);
  if (!core) return raw;

  if (UUID.test(core)) {
    protectedIds.push(core);
    return `${lead}\uE000${protectedIds.length - 1}\uE001${trail}`;
  }
  // `personal:<uuid>`, `ai:organization:<uuid>`: a key ending in an opaque id.
  if (
    core.length > 37 &&
    core[core.length - 37] === ":" &&
    UUID.test(core.slice(-36)) &&
    /^[a-z_:]+$/i.test(core.slice(0, -36))
  ) {
    protectedIds.push(core);
    return `${lead}\uE000${protectedIds.length - 1}\uE001${trail}`;
  }
  const lower = core.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return `${lead}${sanitizeUrl(core, { keepPath: false })}${trail}`;
  }
  const at = core.indexOf("@");
  if (at > 0 && core.indexOf(".", at) > at + 1) {
    return `${lead}[email]${trail}`;
  }
  if (SECRET_PREFIXES.some((prefix) => core.startsWith(prefix))) {
    return `${lead}[secret]${trail}`;
  }
  const eq = core.indexOf("=");
  const colon = core.indexOf(":");
  const separator =
    eq > 0 ? eq : colon > 0 && colon < core.length - 1 ? colon : -1;
  if (separator > 0) {
    const key = core
      .slice(0, separator)
      .replace(/[^a-z_]/gi, "")
      .toLowerCase();
    if (SENSITIVE_KEYS.includes(key)) {
      return `${lead}${core.slice(0, separator + 1)}[redacted]${trail}`;
    }
  }
  if (isJwtLike(core)) return `${lead}[secret]${trail}`;
  if (core.length >= 32 && /^[A-Za-z0-9_\-+/=.]+$/.test(core)) {
    return `${lead}[token]${trail}`;
  }
  return raw;
}

function isJwtLike(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 3 &&
    value.length > 40 &&
    parts.every((part) => part.length >= 10 && /^[A-Za-z0-9_-]+$/.test(part))
  );
}

const PHONE_CHARS = new Set("0123456789+()-. /".split(""));
/** A whole ISO date, `2026-11-10`, not glued to another digit. */
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?!\d)/;

/**
 * Replaces runs of digits and phone separators holding seven or more digits.
 * Linear: each character is visited once. A complete ISO date (`2026-11-10`)
 * is left alone and the scan goes on right after it, so a number that follows
 * a date (`2026-11-10 415-555-0100`) is still a phone run; a time of day has
 * too few digits to match.
 */
function redactPhoneRuns(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const startsRun = (ch >= "0" && ch <= "9") || ch === "+" || ch === "(";
    if (!startsRun) {
      out += ch;
      i += 1;
      continue;
    }
    if (ISO_DATE.test(text.slice(i, i + 11))) {
      out += text.slice(i, i + 10);
      i += 10;
      continue;
    }
    let j = i;
    let digits = 0;
    while (j < text.length && PHONE_CHARS.has(text[j]!)) {
      const c = text[j]!;
      if (c >= "0" && c <= "9") digits += 1;
      j += 1;
    }
    let run = text.slice(i, j);
    // Trailing separators belong to the sentence, not the number.
    let trailing = "";
    while (run.length && " .-/".includes(run[run.length - 1]!)) {
      trailing = run[run.length - 1]! + trailing;
      run = run.slice(0, -1);
    }
    if (digits >= 7) {
      out += `[phone]${trailing}`;
    } else {
      out += run + trailing;
    }
    i = j;
  }
  return out;
}

/**
 * Whether `text` holds a phone-like run, in any format — `+1-415-555-0100`
 * as much as `4155550100`. A complete ISO date is not one, but it does not
 * hide a number after it (`redactPhoneRuns`).
 */
function containsPhoneRun(text: string): boolean {
  return redactPhoneRuns(text) !== text;
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * A URL safe to export: scheme and host, the path with personal or opaque
 * segments replaced, and only campaign-attribution query parameters. The
 * fragment is dropped.
 */
export function sanitizeUrl(
  raw: string,
  options: { keepPath?: boolean } = {},
): string {
  let url: URL;
  try {
    url = new URL(raw.slice(0, MAX_SCANNED_LENGTH));
  } catch {
    return "[url]";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "[url]";
  const keepPath = options.keepPath ?? true;
  const path = keepPath ? sanitizePath(url.pathname) : "/…";
  const kept = [...url.searchParams.entries()].filter(([key]) =>
    ALLOWED_QUERY_PARAMS.has(key.toLowerCase()),
  );
  const query = kept.length
    ? `?${kept
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(
              redactSensitiveText(value, 80),
            )}`,
        )
        .join("&")}`
    : "";
  return `${url.protocol}//${url.host}${path}${query}`;
}

/** A path with every segment that may identify a person replaced. */
export function sanitizePath(pathname: string): string {
  return pathname
    .slice(0, 512)
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return ":segment";
      }
      if (UUID.test(decoded)) return segment;
      if (decoded.includes("@")) return ":email";
      const digits = decoded.replace(/[^0-9]/g, "").length;
      if (digits >= 7) return ":number";
      if (decoded.length >= 32) return ":token";
      return segment;
    })
    .join("/");
}

/**
 * A stack trace without what it should not carry: the message lines are
 * redacted like any message, URLs lose their query strings and absolute file
 * paths are cut to the repository-relative part.
 */
export function sanitizeStackTrace(stack: unknown): string {
  if (typeof stack !== "string" || !stack) return "";
  const lines = stack.slice(0, MAX_SCANNED_LENGTH * 4).split("\n");
  const out: string[] = [];
  for (const line of lines.slice(0, MAX_STACK_LINES)) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("at ")) {
      out.push(sanitizeFrame(line));
    } else {
      out.push(redactSensitiveText(line));
    }
  }
  return out.join("\n");
}

function sanitizeFrame(line: string): string {
  // Query strings on chunk URLs (deployment tokens, signed URLs).
  let frame = line.replace(/\?[^:)\s]*/g, "");
  // Absolute file system paths → repository-relative.
  for (const marker of ["/node_modules/", "/apps/", "/packages/", "/src/"]) {
    const index = frame.indexOf(marker);
    if (index > 0) {
      const open = frame.lastIndexOf("(", index);
      const prefixEnd = open >= 0 ? open + 1 : frame.indexOf("at ") + 3;
      if (prefixEnd > 0 && prefixEnd <= index) {
        frame = `${frame.slice(0, prefixEnd)}${frame.slice(index + 1)}`;
      }
      break;
    }
  }
  return frame.length > 300 ? `${frame.slice(0, 299)}…` : frame;
}

/** A bounded, machine-readable code for an error — never its message. */
export function normalizeErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    getStatus?: () => unknown;
    response?: { status?: unknown };
    name?: unknown;
  };
  if (typeof candidate.code === "string") {
    if (/^P\d{4}$/.test(candidate.code)) return `prisma_${candidate.code}`;
    if (/^E[A-Z0-9_]{2,30}$/.test(candidate.code)) return candidate.code;
    if (/^[a-z][a-z0-9_]{1,40}$/.test(candidate.code)) return candidate.code;
  }
  const status =
    (typeof candidate.getStatus === "function"
      ? candidate.getStatus()
      : undefined) ??
    candidate.status ??
    candidate.statusCode ??
    candidate.response?.status;
  if (typeof status === "number" && status >= 100 && status < 600) {
    return `http_${status}`;
  }
  if (
    typeof candidate.name === "string" &&
    /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(candidate.name)
  ) {
    return candidate.name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  }
  return "unknown";
}

/** An error and its causes, redacted, to a bounded depth. */
export function sanitizeError(error: unknown, depth = 0): SanitizedError {
  if (!(error instanceof Error)) {
    return {
      type: typeof error === "object" && error ? "Object" : typeof error,
      message: redactSensitiveText(
        typeof error === "string" ? error : "Non-error value thrown",
      ),
      code: normalizeErrorCode(error),
    };
  }
  const sanitized: SanitizedError = {
    type: /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(error.name)
      ? error.name
      : "Error",
    message: redactSensitiveText(error.message),
    code: normalizeErrorCode(error),
  };
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    sanitized.cause = sanitizeError(cause, depth + 1);
  }
  return sanitized;
}

/**
 * A copy of `error` whose message, cause chain and stack are sanitized, for
 * SDKs that read the error object itself (exception capture). The original
 * error is not touched.
 */
export function toSanitizedErrorObject(error: unknown): Error {
  const sanitized = sanitizeError(error);
  const copy = new Error(sanitized.message);
  copy.name = sanitized.type;
  copy.stack = sanitizeStackTrace(
    error instanceof Error ? error.stack : undefined,
  );
  if (sanitized.cause) {
    (copy as { cause?: unknown }).cause = toSanitizedCause(sanitized.cause);
  }
  return copy;
}

function toSanitizedCause(cause: SanitizedError): Error {
  const copy = new Error(cause.message);
  copy.name = cause.type;
  copy.stack = `${cause.type}: ${cause.message}`;
  if (cause.cause) {
    (copy as { cause?: unknown }).cause = toSanitizedCause(cause.cause);
  }
  return copy;
}

/**
 * Keeps only the properties a fact may carry, with scalar, bounded values.
 * A string that is not a plain code is redacted and cut; lists are kept only
 * as lists of short codes.
 */
export function sanitizeFactProperties(
  fact: BackendAnalyticsFact,
  properties: Record<string, unknown>,
): Record<string, AnalyticsPropertyValue | string[]> {
  const allowed = allowedFactProperties(fact);
  const out: Record<string, AnalyticsPropertyValue | string[]> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowed.has(key)) continue;
    const clean = sanitizePropertyValue(value);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

export function sanitizePropertyValue(
  value: unknown,
): AnalyticsPropertyValue | string[] | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined;
  }
  if (typeof value === "string") return sanitizeStringValue(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const codes = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => /^[a-z0-9_:-]{1,40}$/i.test(item))
      // A list carries codes: a phone number, dashed or not, is dropped.
      .filter((item) => UUID.test(item) || !containsPhoneRun(item))
      .slice(0, MAX_LIST_ITEMS);
    return codes;
  }
  return undefined;
}

function sanitizeStringValue(value: string): string {
  const trimmed = value.trim();
  // Opaque ids and workspace keys are correlation keys, not personal data.
  if (UUID.test(trimmed)) return trimmed;
  const prefix = trimmed.slice(0, -36);
  if (
    trimmed.length <= 80 &&
    prefix.endsWith(":") &&
    /^[a-z_:]+$/i.test(prefix) &&
    UUID.test(trimmed.slice(-36))
  ) {
    return trimmed;
  }
  // A plain code passes as it is — unless it holds a phone-like run, which a
  // code's characters (digits, `+`, `-`, `.`) can spell.
  if (
    /^[A-Za-z0-9_:\-.+<>]{1,64}$/.test(trimmed) &&
    !containsPhoneRun(trimmed)
  ) {
    return trimmed;
  }
  return redactSensitiveText(trimmed, MAX_STRING_PROPERTY);
}
