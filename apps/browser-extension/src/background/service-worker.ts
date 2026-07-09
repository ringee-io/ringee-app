/**
 * Background service worker — the privileged coordinator. It is the ONLY
 * context that holds auth, can open the side panel, and owns the offscreen
 * document lifecycle.
 *
 * It does NOT run WebRTC (that lives in the offscreen document) and it does NOT
 * decide business rules — it asks the backend to prepare the call and relays
 * the result. The flow when a number is clicked:
 *
 *   DIAL_REQUEST → open side panel → backend prepare-call (auth, workspace,
 *   permissions, credits, DNC, caller ID, contact) → ensure offscreen →
 *   START_CALL → relay call events back to the side panel.
 */
import { createClerkClient } from "@clerk/chrome-extension/background";
import {
  MessageType,
  isCallCommand,
  isCallEvent,
  isDialRequest,
  type CallSnapshotMsg,
  type DialTarget,
} from "@ringee/dialer-core/contracts";
import { resolveDialNumber } from "@ringee/dialer-core/phone";
import { ApiError, RingeeApi } from "../lib/ringee-api";
import {
  ERROR_COPY,
  buildStartCall,
  buildStaticStartCall,
  failureSnapshot,
} from "../lib/call-flow";
import { DEFAULT_REGION } from "../lib/region";
import { getSelectedCallerId } from "../lib/selected-caller-id";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const SYNC_HOST =
  import.meta.env.VITE_CLERK_SYNC_HOST ?? "https://www.ringee.io";

// ── Auth ──────────────────────────────────────────────────────────────────────
async function clerk() {
  return createClerkClient({
    publishableKey: PUBLISHABLE_KEY,
    syncHost: SYNC_HOST,
  });
}
async function getToken(opts?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  const c = await clerk();
  if (!c.session) return null;
  // Skip Clerk's in-memory cache when we're retrying a 401 — the cached
  // short-lived JWT has usually just expired.
  return c.session.getToken(
    opts?.forceRefresh ? { skipCache: true } : undefined,
  );
}
async function getIdentity(): Promise<{
  userId: string;
  orgId?: string;
} | null> {
  const c = await clerk();
  if (!c.user) return null;
  return { userId: c.user.id, orgId: c.organization?.id };
}
const api = new RingeeApi(getToken);

// ── Snapshot the side panel rehydrates from ───────────────────────────────────
let snapshot: CallSnapshotMsg = {
  type: MessageType.CallSnapshot,
  state: "idle",
};
function setSnapshot(patch: Partial<Omit<CallSnapshotMsg, "type">>) {
  snapshot = { ...snapshot, ...patch, type: MessageType.CallSnapshot };
  chrome.runtime.sendMessage(snapshot).catch(() => {});
}

// ── Offscreen lifecycle ───────────────────────────────────────────────────────
async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: "src/offscreen/offscreen.html",
    reasons: [
      chrome.offscreen.Reason.USER_MEDIA,
      chrome.offscreen.Reason.AUDIO_PLAYBACK,
    ],
    justification:
      "Maintain the active WebRTC voice call (microphone + remote audio).",
  });
}
async function closeOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length) await chrome.offscreen.closeDocument().catch(() => {});
}

// ── Main dial pipeline ────────────────────────────────────────────────────────
async function dial(target: DialTarget, tabId?: number) {
  setSnapshot({
    state: "requesting",
    destination: target.destination,
    contact: undefined,
    origin: target.origin,
    callId: undefined,
    error: undefined,
    dncBlocked: false,
    startedAt: undefined,
  });
  if (tabId !== undefined) chrome.sidePanel.open({ tabId }).catch(() => {});

  const identity = await getIdentity();
  if (!identity) {
    setSnapshot({ state: "failed", error: ERROR_COPY.UNAUTHENTICATED });
    return;
  }

  // The number the user picked in the panel header (null → Automatic). The
  // backend re-validates it and ignores it when it isn't a valid caller ID.
  const preferredCallerId = (await getSelectedCallerId()) ?? undefined;

  // The backend owns every business rule: workspace, permissions, credits, DNC,
  // caller ID resolution, find-or-create contact, and minting WebRTC creds.
  let prepared;
  try {
    prepared = await api.prepareCall({
      destination: target.destination,
      name: target.name,
      company: target.company,
      origin: target.origin,
      preferredCallerId,
    });
  } catch (e) {
    const code = e instanceof ApiError ? e.code : "UNKNOWN";
    // If static env credentials are configured (web-app style), dial with them
    // even when the backend prepare-call is unavailable. Compliance/permission
    // blocks (DNC, forbidden) are NEVER bypassed this way.
    const fallback =
      code === "DNC_BLOCKED" || code === "FORBIDDEN"
        ? null
        : buildStaticStartCall(target, identity);
    if (fallback) {
      setSnapshot({
        state: "connecting",
        destination: target.destination,
        contact: undefined,
        callId: undefined,
        startedAt: Date.now(),
      });
      await ensureOffscreen();
      chrome.runtime.sendMessage(fallback).catch(() => {});
      return;
    }
    setSnapshot(failureSnapshot(code));
    return;
  }

  setSnapshot({
    state: "connecting",
    destination: prepared.destination,
    contact: prepared.contact,
    callId: prepared.callId ?? undefined,
    startedAt: Date.now(),
  });

  await ensureOffscreen();
  chrome.runtime
    .sendMessage(buildStartCall(prepared, identity))
    .catch(() => {});
}

// ── Router ────────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (isDialRequest(msg)) {
    void dial(msg.target, _sender.tab?.id);
    return false;
  }
  if (isCallCommand(msg)) {
    // From side panel → forward verbatim to the offscreen engine.
    chrome.runtime.sendMessage(msg).catch(() => {});
    return false;
  }
  if (isCallEvent(msg)) {
    // From offscreen → reflect in the snapshot for the side panel. A call that
    // ends/fails carries the Telnyx hangup cause; keep it so an unexpected
    // auto-hangup is visible instead of a silent "Call ended".
    const cause = msg.detail?.cause;
    if ((msg.state === "ended" || msg.state === "failed") && cause) {
      console.warn(`[Ringee] ${msg.state}: ${cause}`);
    }
    setSnapshot({
      state: msg.state,
      error: msg.detail?.error ?? cause,
      telnyxSessionId: msg.detail?.telnyxSessionId,
    });
    // Call finished: release the mic + tear down the WebRTC context. The
    // post-call (outcome/notes) UI lives in the side panel and needs no engine.
    if (msg.state === "ended" || msg.state === "failed") {
      void closeOffscreen();
    }
    return false;
  }
  if (msg?.type === MessageType.RequestSnapshot) {
    sendResponse?.(snapshot);
    chrome.runtime.sendMessage(snapshot).catch(() => {});
    return false;
  }
  if (msg?.type === MessageType.EndCall) {
    void closeOffscreen();
    setSnapshot({
      state: "idle",
      destination: undefined,
      contact: undefined,
      origin: undefined,
      callId: undefined,
      error: undefined,
      dncBlocked: false,
      startedAt: undefined,
    });
    return false;
  }
  return false;
});

// ── Context menu: "Call with Ringee" on any selected text ─────────────────────
const MENU_ID = "ringee-call-selection";

chrome.runtime.onInstalled.addListener(() => {
  // Clicking the toolbar icon opens the side panel directly.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Call "%s" with Ringee',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  const e164 = resolveDialNumber(info.selectionText, DEFAULT_REGION);
  if (!e164) {
    setSnapshot({
      state: "failed",
      error: "That selection isn't a valid phone number.",
    });
    if (tab?.id !== undefined)
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    return;
  }
  void dial(
    {
      destination: e164,
      origin: tab?.url
        ? { url: tab.url, title: tab.title, source: hostnameOf(tab.url) }
        : undefined,
    },
    tab?.id,
  );
});

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
