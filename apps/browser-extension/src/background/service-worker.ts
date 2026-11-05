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
  isCallQuality,
  isDialRequest,
  isEndCall,
  isRequestAuthToken,
  isRequestSnapshot,
  type AuthTokenResult,
  type CallCommandMsg,
  type CallSnapshotMsg,
  type DialResult,
  type DialTarget,
} from "@ringee/dialer-core/contracts";
import { resolveDialNumber } from "@ringee/dialer-core/phone";
import { ApiError, RingeeApi } from "../lib/ringee-api";
import {
  ERROR_COPY,
  buildStartCall,
  callEventSnapshotPatch,
  failureSnapshot,
  reportsPlacedLeg,
} from "../lib/call-flow";
import { createCallSnapshotStore } from "../lib/call-snapshot";
import { recordCallQuality } from "../lib/call-quality-log";
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
/**
 * A token for a side panel whose own lapsed or was refused, minted for it
 * rather than read from Clerk's cache, and whose session it is: the panel uses
 * it only for the user and workspace it shows (lib/panel-token.ts).
 */
async function getPanelAuth(): Promise<AuthTokenResult> {
  const c = await clerk();
  if (!c.session) return { token: null };
  return {
    token: await c.session.getToken({ skipCache: true }),
    userId: c.user?.id ?? null,
    orgId: c.organization?.id ?? null,
  };
}
const api = new RingeeApi(getToken);

/**
 * A page of this extension (the side panel), as opposed to a content script:
 * that one runs inside a web page, and its messages carry the page's URL.
 */
function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    !!sender.url?.startsWith(chrome.runtime.getURL(""))
  );
}

// ── Snapshot the side panel rehydrates from ───────────────────────────────────
// Mirrored into session storage: Chrome stops this worker during a quiet call,
// and the one the call's end wakes up must still know whose call it was.
const calls = createCallSnapshotStore(chrome.storage.session, (snapshot) => {
  chrome.runtime.sendMessage(snapshot).catch(() => {});
});
function setSnapshot(patch: Partial<Omit<CallSnapshotMsg, "type">>) {
  calls.update(patch);
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
/** A snapshot with no call in it. */
const NO_CALL: Partial<Omit<CallSnapshotMsg, "type">> = {
  state: "idle",
  destination: undefined,
  contact: undefined,
  origin: undefined,
  callId: undefined,
  error: undefined,
  dncBlocked: false,
  concurrentCall: false,
  startedAt: undefined,
  endedAt: undefined,
  userId: undefined,
  telnyxSessionId: undefined,
};

/** How long a dial waits for the engine to report its leg. */
const ENGINE_REPORT_MS = 20_000;

interface DialAttempt {
  /** Hung up while the backend was still authorizing it. */
  cancelled: boolean;
  /** Answers the dial at once: it was called off. */
  callOff: () => void;
}

/** The dial in progress, so a hang-up before its leg exists calls it off. */
let currentDial: DialAttempt | null = null;

/** Answers the dial that waits on the engine's first report on its leg. */
let settleDial: ((placed: boolean) => void) | null = null;

/**
 * Resolves with whether the engine's first report says the leg was placed. A
 * leg not reported in time is called off, so it is never placed after its dial
 * was answered as not placed.
 */
function engineReport(): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.runtime
        .sendMessage({
          type: MessageType.CallCommand,
          id: crypto.randomUUID(),
          command: { action: "hangup" },
        } satisfies CallCommandMsg)
        .catch(() => {});
      settle(false);
    }, ENGINE_REPORT_MS);
    const settle = (placed: boolean) => {
      clearTimeout(timer);
      if (settleDial === settle) settleDial = null;
      resolve(placed);
    };
    settleDial = settle;
  });
}

/**
 * Resolves `true` once the leg was placed — the backend authorized it and the
 * engine reported it live — and `false` as soon as it is refused or called off.
 */
function dial(target: DialTarget, tabId?: number): Promise<boolean> {
  let callOff = () => {};
  const calledOff = new Promise<boolean>((resolve) => {
    callOff = () => resolve(false);
  });
  const attempt: DialAttempt = { cancelled: false, callOff };
  currentDial = attempt;
  // A dial still waiting on the engine is superseded by this one.
  settleDial?.(false);
  return Promise.race([placeDial(attempt, target, tabId), calledOff]);
}

async function placeDial(
  attempt: DialAttempt,
  target: DialTarget,
  tabId?: number,
): Promise<boolean> {
  setSnapshot({
    state: "requesting",
    destination: target.destination,
    contact: undefined,
    origin: target.origin,
    callId: undefined,
    error: undefined,
    dncBlocked: false,
    concurrentCall: false,
    startedAt: undefined,
    endedAt: undefined,
    userId: undefined,
    // Never let a previous call's Telnyx id leak into this call. Once the new
    // id arrives, callEventSnapshotPatch keeps it through the final SDK event.
    telnyxSessionId: undefined,
  });
  if (tabId !== undefined) chrome.sidePanel.open({ tabId }).catch(() => {});

  const identity = await getIdentity();
  if (attempt.cancelled) return false;
  if (!identity) {
    setSnapshot({ state: "failed", error: ERROR_COPY.UNAUTHENTICATED });
    return false;
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
    if (attempt.cancelled) return false;
    // No backend, no call: the backend is what mints the leg's credential and
    // authorizes it, so there is nothing to dial with on its failure.
    const code = e instanceof ApiError ? e.code : "UNKNOWN";
    const serverMessage = e instanceof ApiError ? e.message : null;
    setSnapshot({
      ...failureSnapshot(code, serverMessage),
      userId: identity.userId,
    });
    return false;
  }

  // Hung up while the backend was authorizing: no leg is placed, and the
  // backend's pending dial lease lapses on its own.
  if (attempt.cancelled) return false;

  setSnapshot({
    state: "connecting",
    destination: prepared.destination,
    contact: prepared.contact,
    callId: prepared.callId ?? undefined,
    startedAt: Date.now(),
    userId: identity.userId,
  });

  await ensureOffscreen();
  const placed = engineReport();
  chrome.runtime
    .sendMessage(buildStartCall(prepared, identity))
    .catch(() => {});
  return placed;
}

// ── Router ────────────────────────────────────────────────────────────────────
/**
 * Settles once a woken worker has the call snapshot back. A dial the backend
 * was still authorizing died with the worker that placed it: nothing moves it
 * past "requesting" (no leg exists, and the backend's dial lease lapses on its
 * own), and the panel would wait on it for good. It is no call.
 */
const restored = calls.restored.then(() => {
  if (!currentDial && calls.current.state === "requesting") {
    setSnapshot(NO_CALL);
  }
});

/**
 * A finished call's wrap-up names its contact and outlives the worker, so it
 * goes only to the user who placed the call: once someone else is signed in
 * to this browser, or no one is, it is forgotten before it is shown.
 */
async function forgetAnotherUsersWrapUp(): Promise<void> {
  const snapshot = calls.current;
  if (snapshot.state !== "ended" || !snapshot.userId) return;
  let identity;
  try {
    identity = await getIdentity();
  } catch {
    // Clerk could not be asked: keep it, rather than lose the user's own.
    return;
  }
  // A dial, or the wrap-up's close, replaced it meanwhile.
  if (calls.current !== snapshot) return;
  if (identity?.userId !== snapshot.userId) setSnapshot(NO_CALL);
}

/** Handles one message once the call snapshot has been read back. */
function route(
  msg: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): void {
  if (isDialRequest(msg)) {
    // Answer with whether the leg was placed: the side panel's queue completes
    // a callback only once it has actually been called (CALL-013).
    dial(msg.target, sender.tab?.id).then(
      (placed) => sendResponse({ placed } satisfies DialResult),
      () => sendResponse({ placed: false } satisfies DialResult),
    );
    return;
  }
  if (isCallCommand(msg)) {
    // A hang-up while the backend is still authorizing the dial: there is no
    // leg to end yet, so the dial is called off and never placed.
    if (
      msg.command.action === "hangup" &&
      calls.current.state === "requesting" &&
      currentDial &&
      !currentDial.cancelled
    ) {
      currentDial.cancelled = true;
      currentDial.callOff();
      setSnapshot(NO_CALL);
      return;
    }
    // From side panel → forward verbatim to the offscreen engine.
    chrome.runtime.sendMessage(msg).catch(() => {});
    return;
  }
  if (isCallQuality(msg)) {
    // The offscreen engine's record of how the call's outgoing audio flowed;
    // that document closes with the call, so the record is kept here.
    void recordCallQuality(msg.summary);
    return;
  }
  if (isCallEvent(msg)) {
    // The engine's first report on a dial answers it: a live leg was placed.
    settleDial?.(reportsPlacedLeg(msg.state));
    // Hung up before its leg existed: back to no call, with no post-call.
    if (msg.state === "idle") {
      setSnapshot(NO_CALL);
      void closeOffscreen();
      return;
    }
    // From offscreen → reflect in the snapshot for the side panel. A call that
    // ends/fails carries the Telnyx hangup cause; keep it so an unexpected
    // auto-hangup is visible instead of a silent "Call ended".
    const cause = msg.detail?.cause;
    if ((msg.state === "ended" || msg.state === "failed") && cause) {
      console.warn(`[Ringee] ${msg.state}: ${cause}`);
    }
    setSnapshot(callEventSnapshotPatch(calls.current, msg));
    // Call finished: release the mic + tear down the WebRTC context. The
    // post-call (outcome/notes) UI lives in the side panel and needs no engine.
    if (msg.state === "ended" || msg.state === "failed") {
      void closeOffscreen();
    }
    return;
  }
  if (isRequestSnapshot(msg)) {
    void forgetAnotherUsersWrapUp().then(() => {
      sendResponse(calls.current);
      chrome.runtime.sendMessage(calls.current).catch(() => {});
    });
    return;
  }
  if (isEndCall(msg)) {
    void closeOffscreen();
    setSnapshot(NO_CALL);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (isRequestAuthToken(msg)) {
    // Only this extension's own pages get a token: a content script runs
    // inside a web page, and a page that took it over would hold the session.
    if (!isExtensionPage(sender)) return false;
    // A fresh Clerk client, like a dial's: its token is current even when the
    // side panel's own copy could not renew one (lib/panel-token.ts).
    getPanelAuth().then(
      (auth) => sendResponse(auth),
      () => sendResponse({ token: null } satisfies AuthTokenResult),
    );
    return true;
  }
  // Everything else reads or writes the call snapshot, which a worker started
  // mid-call reads back from session storage first. Waiting on the same
  // promise keeps the messages in the order they arrived.
  void restored.then(() => route(msg, sender, sendResponse));
  // The channel stays open for the two messages that get an answer.
  return isDialRequest(msg) || isRequestSnapshot(msg);
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
