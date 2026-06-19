/**
 * Microphone permission page — runs in a real tab.
 *
 * Why a tab: in Manifest V3 the live call lives in the offscreen document, which
 * is headless and cannot show Chrome's microphone prompt. The side panel and the
 * popup can't show it either — Chrome rejects `getUserMedia` there with
 * NotAllowedError instead of prompting. A normal tab IS allowed to prompt, so we
 * open THIS page to capture the grant. Once the user allows, the permission is
 * stored for the chrome-extension:// origin and the offscreen engine's
 * `getUserMedia` (called internally by Telnyx) succeeds on every later call.
 */
const enableBtn = document.getElementById("enable") as HTMLButtonElement | null;
const statusEl = document.getElementById("status");

function setStatus(text: string, kind?: "ok" | "err") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `status${kind ? ` ${kind}` : ""}`;
}

async function requestMic(): Promise<void> {
  if (enableBtn) enableBtn.disabled = true;
  setStatus("Waiting for your permission…");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // We only needed the grant to persist — release the device so the offscreen
    // engine is the single owner of the mic during the call.
    stream.getTracks().forEach((t) => t.stop());
    setStatus("Microphone enabled. You can close this tab and place your call.", "ok");
    // Give the user a beat to read the message, then close the helper tab.
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    if (enableBtn) enableBtn.disabled = false;
    const denied =
      err instanceof DOMException &&
      (err.name === "NotAllowedError" || err.name === "SecurityError");
    setStatus(
      denied
        ? "Microphone was blocked. Click the camera/mic icon in the address bar, allow it, then try again."
        : "Couldn't access a microphone. Check that one is connected, then try again.",
      "err",
    );
  }
}

enableBtn?.addEventListener("click", () => void requestMic());

// Most browsers prompt on load for a top-level tab; the button is the reliable
// user-gesture fallback if the auto-attempt is suppressed.
void requestMic();
