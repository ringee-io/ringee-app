/**
 * What the browser may send to the analytics provider (Stage 4B), mirrored
 * from the server's `@ringee/platform` sanitizer, which the dashboard may not
 * import (ARCH-003). Deliberately blunt: a contact's number, an email, a token
 * or a free-text note never leaves in a URL, a property or an error message.
 *
 * Every scan is linear in its capped input — no backtracking expression runs
 * on untrusted text.
 */

export type AnalyticsValue = string | number | boolean | null;

const MAX_SCANNED = 4_000;
const MAX_TEXT = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Query parameters that may stay on a URL: campaign attribution only. */
const ALLOWED_QUERY = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "ref",
  "gclid",
  "fbclid",
]);

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
      if (UUID.test(decoded)) return ":id";
      if (decoded.includes("@")) return ":email";
      if (decoded.replace(/[^0-9]/g, "").length >= 7) return ":number";
      if (decoded.length >= 32) return ":token";
      return segment;
    })
    .join("/");
}

/**
 * A URL safe to export: origin, the sanitized path and only attribution
 * parameters. Fragments are dropped (they carry settings panes and tokens).
 */
export function sanitizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.slice(0, MAX_SCANNED));
  } catch {
    return "[url]";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "[url]";
  const kept = [...url.searchParams.entries()].filter(([key]) =>
    ALLOWED_QUERY.has(key.toLowerCase()),
  );
  const query = kept.length
    ? `?${kept
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(
              redactText(value, 80),
            )}`,
        )
        .join("&")}`
    : "";
  return `${url.protocol}//${url.host}${sanitizePath(url.pathname)}${query}`;
}

/**
 * A stack frame's script URL, without its query or fragment. The app's own
 * build assets — `/_next/static/` on the page's own origin, where Next serves
 * them (no `assetPrefix`) — keep their path: a chunk's name identifies code,
 * never a person, and symbolication matches on it. Any other URL (the page of
 * an inline script, another origin, the same path on another origin) is
 * sanitized like a page URL.
 */
export function sanitizeFrameUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.slice(0, MAX_SCANNED));
  } catch {
    return "[url]";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "[url]";
  const appOrigin =
    typeof window !== "undefined" ? window.location.origin : null;
  if (url.origin === appOrigin && url.pathname.startsWith("/_next/static/")) {
    return `${url.protocol}//${url.host}${url.pathname}`;
  }
  return sanitizeUrl(`${url.protocol}//${url.host}${url.pathname}`);
}

/**
 * One `at …` line of a stack trace with every URL in it sanitized
 * (`sanitizeFrameUrl`) and its `:line:column` kept.
 */
export function sanitizeStackFrame(line: string): string {
  return line.slice(0, MAX_SCANNED).replace(/[^\s()]+/g, (token) => {
    if (!token.includes("://")) return token;
    const [url, location] = splitFrameLocation(token);
    return `${sanitizeFrameUrl(url)}${location}`;
  });
}

/** `https://…/app.js:12:34` → [`https://…/app.js`, `:12:34`]. Linear. */
function splitFrameLocation(token: string): [string, string] {
  let end = token.length;
  for (let part = 0; part < 2; part += 1) {
    let start = end;
    while (start > 0 && token[start - 1]! >= "0" && token[start - 1]! <= "9") {
      start -= 1;
    }
    if (start === end || start === 0 || token[start - 1] !== ":") break;
    end = start - 1;
  }
  return [token.slice(0, end), token.slice(end)];
}

/**
 * Redacts what may identify a person or grant access in free text: quoted
 * spans, emails, phone-like digit runs, URLs beyond their host, long opaque
 * tokens and `key=value` pairs with a sensitive key. UUIDs are kept.
 */
export function redactText(input: unknown, max = MAX_TEXT): string {
  if (input === null || input === undefined) return "";
  let text = String(input).slice(0, MAX_SCANNED);
  text = redactQuoted(text);
  text = text
    .split(/(\s+)/)
    .map((token) => (/^\s*$/.test(token) ? token : redactToken(token)))
    .join("");
  text = redactDigitRuns(text);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "auth",
  "signature",
  "otp",
  "code",
  "session",
  "cookie",
  "email",
  "phone",
  "to",
  "from",
]);

function redactToken(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end && "([{<\"'".includes(raw[start]!)) start += 1;
  while (end > start && ".,;:!?)]}>\"'".includes(raw[end - 1]!)) end -= 1;
  const lead = raw.slice(0, start);
  const core = raw.slice(start, end);
  const trail = raw.slice(end);
  if (!core || UUID.test(core)) return raw;
  const lower = core.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    try {
      return `${lead}${new URL(core).origin}/…${trail}`;
    } catch {
      return `${lead}[url]${trail}`;
    }
  }
  const at = core.indexOf("@");
  if (at > 0 && core.indexOf(".", at) > at + 1) return `${lead}[email]${trail}`;
  const eq = core.indexOf("=");
  if (eq > 0) {
    const key = core
      .slice(0, eq)
      .replace(/[^a-z_]/gi, "")
      .toLowerCase();
    if (SENSITIVE_KEYS.has(key)) {
      return `${lead}${core.slice(0, eq + 1)}[redacted]${trail}`;
    }
  }
  if (core.length >= 32 && /^[A-Za-z0-9_\-+/=.]+$/.test(core)) {
    return `${lead}[token]${trail}`;
  }
  return raw;
}

function redactQuoted(text: string): string {
  let out = "";
  let i = 0;
  const pairs: Record<string, string> = { '"': '"', "“": "”", "«": "»" };
  while (i < text.length) {
    const ch = text[i]!;
    const close = pairs[ch];
    if (close) {
      const end = text.indexOf(close, i + 1);
      if (end > i && end - i <= 200) {
        out += `${ch}…${close}`;
        i = end + 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

const PHONE_CHARS = new Set("0123456789+()-. /".split(""));
/** A whole ISO date, `2026-11-10`, not glued to another digit. */
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?!\d)/;

/**
 * Runs of digits and phone separators with seven or more digits. A complete
 * ISO date is kept and the scan goes on right after it, so a number that
 * follows a date (`2026-11-10 415-555-0100`) is still a phone run.
 */
function redactDigitRuns(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (!((ch >= "0" && ch <= "9") || ch === "+" || ch === "(")) {
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
      if (text[j]! >= "0" && text[j]! <= "9") digits += 1;
      j += 1;
    }
    const run = text.slice(i, j);
    out += digits >= 7 ? "[phone]" : run;
    i = j;
  }
  return out;
}

/**
 * Whether `text` holds a phone-like run in any format — `+1-415-555-0100` as
 * much as `4155550100`. A complete ISO date is not one, but it does not hide
 * a number after it.
 */
function containsPhoneRun(text: string): boolean {
  return redactDigitRuns(text) !== text;
}

/** A bounded scalar for a property; undefined drops it. */
export function sanitizeValue(
  value: unknown,
): AnalyticsValue | string[] | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    // A plain code passes as it is — unless it holds a phone-like run, which
    // a code's characters (digits, `+`, `-`, `.`) can spell.
    if (
      /^[A-Za-z0-9_:\-.+<>]{1,64}$/.test(trimmed) &&
      !/\d{7}/.test(trimmed) &&
      !containsPhoneRun(trimmed)
    ) {
      return trimmed;
    }
    if (UUID.test(trimmed)) return trimmed;
    return redactText(trimmed, 64);
  }
  if (Array.isArray(value)) {
    return (
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => /^[a-z0-9_:-]{1,40}$/i.test(item))
        // A list carries codes: a phone number, dashed or not, is dropped.
        .filter((item) => UUID.test(item) || !containsPhoneRun(item))
        .slice(0, 12)
    );
  }
  return undefined;
}
