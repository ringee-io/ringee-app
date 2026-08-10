const DEVICE_ID_STORAGE_KEY = "ringee.realtime.device-id";

/** Header every authenticated browser request carries to identify the device. */
export const DEVICE_ID_HEADER = "X-Ringee-Device-Id";

/**
 * Stable id for this browser profile.
 *
 * ONE id serves two features that must agree on what "a device" is: the
 * realtime socket registers under it (so the backoffice can list and name
 * connected devices) and every API call sends it, so the one-call-at-a-time
 * rule can tell "the same device re-dialing" from "a second device".
 *
 * Returns undefined when storage is unavailable (private mode, storage
 * disabled). That fails safe: the server then treats the request as an
 * unidentified device, which is refused while another device holds a call
 * rather than being mistaken for it.
 */
export function getRingeeDeviceId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return undefined;
  }
}

/** Best-effort "Chrome · macOS" label, used for the backoffice device list. */
export function describeRingeeDevice(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const ua = navigator.userAgent;

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
            : "Browser";

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
            : "Unknown OS";

  return `${browser} · ${os}`;
}
