/**
 * The last calls' outgoing-audio records, newest first, in
 * `chrome.storage.local`: the offscreen document that measured a call closes
 * with it. When a call is reported as choppy, read them from the extension's
 * service worker console (chrome://extensions → Ringee → service worker):
 *
 *   await chrome.storage.local.get("ringee:callQualityLog")
 *
 * `capturedSec` well under `measuredSec` means the microphone stopped
 * delivering; full capture with `sentPerSec` under 50 means the browser did
 * not send what it captured. See "Browser audio" in docs/engineering/TELEPHONY.md.
 */
import type { CallQualitySummary } from "@ringee/dialer-core/contracts";

const KEY = "ringee:callQualityLog";
const KEEP = 20;

export interface CallQualityEntry extends CallQualitySummary {
  /** When the call ended. */
  at: string;
}

export async function recordCallQuality(
  summary: CallQualitySummary,
  at = new Date(),
): Promise<void> {
  console.info("[Ringee] call audio", summary);
  try {
    const stored = await chrome.storage.local.get(KEY);
    const log: CallQualityEntry[] = Array.isArray(stored?.[KEY])
      ? stored[KEY]
      : [];
    const entry: CallQualityEntry = { at: at.toISOString(), ...summary };
    await chrome.storage.local.set({ [KEY]: [entry, ...log].slice(0, KEEP) });
  } catch {
    // Diagnostics are best-effort; the call itself is unaffected.
  }
}
