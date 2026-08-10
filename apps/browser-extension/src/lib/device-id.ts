const STORAGE_KEY = "ringee.device-id";

/** Header the API reads to tell devices apart (matches the web app). */
export const DEVICE_ID_HEADER = "X-Ringee-Device-Id";

let cached: string | null = null;
let pending: Promise<string> | null = null;

/**
 * Stable id for this extension install.
 *
 * The API uses it for the one-call-at-a-time rule: the extension is its own
 * device, distinct from the Ringee web app running in the same browser, so a
 * call started in one blocks a call started in the other.
 *
 * Cached in memory because the MV3 service worker asks for it on every request
 * but is torn down often; `chrome.storage.local` is the durable copy.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const existing = stored?.[STORAGE_KEY];
      if (typeof existing === "string" && existing) {
        cached = existing;
        return existing;
      }
    } catch {
      // Storage unavailable — fall through and use an ephemeral id.
    }

    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ext_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    cached = generated;
    await chrome.storage.local
      .set({ [STORAGE_KEY]: generated })
      .catch(() => undefined);
    return generated;
  })().finally(() => {
    pending = null;
  });

  return pending;
}
