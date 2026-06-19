/**
 * Microphone permission bridge for the WebRTC engine.
 *
 * The live call runs in the OFFSCREEN document, but offscreen documents are
 * headless — they can't show Chrome's microphone permission prompt. Neither can
 * the side panel: in MV3 Chrome rejects `getUserMedia` there with NotAllowedError
 * instead of prompting. The ONLY context allowed to prompt is a real tab, so when
 * the grant is missing we open `src/permission/index.html` in a tab. Once the
 * user allows, the permission persists for the chrome-extension:// origin and the
 * offscreen document's `getUserMedia` (called internally by Telnyx) succeeds.
 *
 * Without this, a call connects and rings but is torn down moments later because
 * the outbound media (the mic track) was never captured.
 */
let granted = false;

const PERMISSION_PAGE = "src/permission/index.html";

/**
 * Silent check: does the extension already hold the mic grant? Succeeds without
 * any UI when the user granted earlier (the grant is per chrome-extension://
 * origin, so it's visible here and in the offscreen document). Throws — and is
 * NOT able to prompt — from the side panel when the grant is missing.
 */
async function hasMicrophoneAccess(): Promise<boolean> {
  if (granted) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // We only needed the grant — release the device immediately so the offscreen
    // engine is the single owner of the mic during the call.
    stream.getTracks().forEach((t) => t.stop());
    granted = true;
    return true;
  } catch {
    return false;
  }
}

// Several code paths can ask for the prompt for the same call (handleDial, the
// requesting/connecting effect, the failed-state backstop). Throttle so we open
// exactly one tab — querying by URL to focus an existing one would need the
// broad "tabs" permission, which we don't want. The page auto-closes on grant.
let lastRequestAt = 0;
const REQUEST_THROTTLE_MS = 10_000;

/** Open the tab that can actually show the mic permission prompt. */
export function requestMicrophonePermission(): void {
  const now = Date.now();
  if (now - lastRequestAt < REQUEST_THROTTLE_MS) return;
  lastRequestAt = now;
  chrome.tabs.create({ url: chrome.runtime.getURL(PERMISSION_PAGE) });
}

/**
 * Ensure the extension can capture the mic before dialing. Returns true when the
 * grant is already in place; otherwise opens the permission tab (the side panel
 * itself can't prompt) and returns false so the caller can tell the user to allow
 * it and retry.
 */
export async function ensureMicrophoneAccess(): Promise<boolean> {
  if (await hasMicrophoneAccess()) return true;
  requestMicrophonePermission();
  return false;
}
