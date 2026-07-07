/**
 * The user's chosen outbound caller ID, persisted in `chrome.storage.local` so
 * it survives panel reloads AND is readable from every extension context — the
 * side panel writes it, the background service worker reads it when preparing a
 * call. `null` means "Automatic": let the backend resolve the caller ID
 * (rotation / the workspace default), exactly as before this feature.
 *
 * The stored value is only a hint. The backend re-validates it against the
 * workspace's allowed numbers on every call, so a stale pick is harmless.
 */
const KEY = "ringee:selectedCallerId";

/** The picked E.164, or null when set to Automatic / never chosen. */
export async function getSelectedCallerId(): Promise<string | null> {
  try {
    const stored = await chrome.storage.local.get(KEY);
    const value = stored?.[KEY];
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

/** Persist the pick; pass null to go back to Automatic. */
export async function setSelectedCallerId(
  phoneNumber: string | null,
): Promise<void> {
  try {
    if (phoneNumber) {
      await chrome.storage.local.set({ [KEY]: phoneNumber });
    } else {
      await chrome.storage.local.remove(KEY);
    }
  } catch {
    // Storage is best-effort; a failure just means the pick doesn't persist.
  }
}

/**
 * Subscribe to changes to the pick (e.g. from another panel instance). Returns
 * an unsubscribe function. Fires with the new value (null for Automatic).
 */
export function subscribeSelectedCallerId(
  cb: (phoneNumber: string | null) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local" || !(KEY in changes)) return;
    const next = changes[KEY]?.newValue;
    cb(typeof next === "string" && next ? next : null);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
