import { ExecutionContext, createParamDecorator } from "@nestjs/common";

/** Header the browser clients send so the API can tell devices apart. */
export const DEVICE_ID_HEADER = "x-ringee-device-id";

export interface DialDeviceInfo {
  /** Stable per-install id, or a per-request fallback when none was sent. */
  deviceId: string;
  /** Friendly label for error copy, e.g. "Chrome · macOS". */
  deviceLabel: string | null;
}

/**
 * Identifies the device behind a dial request, for the one-call-at-a-time rule.
 *
 * The id comes from `X-Ringee-Device-Id` — the same value the realtime socket
 * registers, so the backoffice device list and this rule agree on what a device
 * is. A client that sends nothing gets a random id, which fails safe: an
 * unidentified device is never mistaken for the one already on a call, so it is
 * refused rather than let through.
 */
export const DialDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DialDeviceInfo => {
    const request = ctx.switchToHttp().getRequest();
    const headers: Record<string, string | string[] | undefined> =
      request.headers ?? {};

    const raw = headers[DEVICE_ID_HEADER];
    const headerValue = Array.isArray(raw) ? raw[0] : raw;
    const deviceId = headerValue?.trim().slice(0, 128);

    const uaRaw = headers["user-agent"];
    const userAgent = Array.isArray(uaRaw) ? uaRaw[0] : uaRaw;

    return {
      deviceId: deviceId || `anon:${randomId()}`,
      deviceLabel: describeUserAgent(userAgent),
    };
  },
);

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Best-effort "Chrome · macOS", mirroring the browser-side label. */
function describeUserAgent(ua: string | undefined): string | null {
  if (!ua) return null;

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : null;

  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iPod/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;

  if (!browser && !os) return null;
  return [browser, os].filter(Boolean).join(" · ");
}
