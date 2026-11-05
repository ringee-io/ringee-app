import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MessageType,
  type CallSnapshotMsg,
} from "@ringee/dialer-core/contracts";
import { CALL_SNAPSHOT_KEY } from "../lib/call-snapshot";

/** The Clerk session a fresh background client loads with. */
const auth = vi.hoisted(() => ({
  userId: "user_1" as string | null,
  orgId: "org_1" as string | null,
  tokenRequests: [] as unknown[],
}));

vi.mock("@clerk/chrome-extension/background", () => ({
  createClerkClient: async () =>
    auth.userId
      ? {
          session: {
            getToken: async (opts?: unknown) => {
              auth.tokenRequests.push(opts);
              return "minted-token";
            },
          },
          user: { id: auth.userId },
          organization: auth.orgId ? { id: auth.orgId } : null,
        }
      : { session: null, user: null, organization: null },
}));

interface Sender {
  id?: string;
  url?: string;
  tab?: { id: number };
}
type Listener = (
  msg: unknown,
  sender: Sender,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined;

const EXTENSION_ID = "ringee-extension";
const page = (path: string) => `chrome-extension://${EXTENSION_ID}/${path}`;
const SIDE_PANEL: Sender = {
  id: EXTENSION_ID,
  url: page("src/sidepanel/index.html"),
};
const OFFSCREEN: Sender = {
  id: EXTENSION_ID,
  url: page("src/offscreen/offscreen.html"),
};
/** This extension's own content script, running inside a web page. */
const CONTENT_SCRIPT: Sender = {
  id: EXTENSION_ID,
  url: "https://crm.example.com/leads/42",
  tab: { id: 7 },
};

let listener: Listener;
let session: Record<string, unknown>;
let writes: Record<string, unknown>[];
let releaseRead: () => void;

/**
 * Starts a worker the way Chrome wakes one: with whatever session storage
 * holds, read back by the time `releaseRead` is called (at once by default).
 */
async function wakeWorker({
  stored,
  holdRead = false,
}: { stored?: CallSnapshotMsg; holdRead?: boolean } = {}) {
  session = stored ? { [CALL_SNAPSHOT_KEY]: structuredClone(stored) } : {};
  writes = [];
  let release = () => {};
  const read = new Promise<void>((resolve) => {
    release = resolve;
  });
  releaseRead = release;
  if (!holdRead) release();

  vi.stubGlobal("chrome", {
    runtime: {
      id: EXTENSION_ID,
      getURL: page,
      sendMessage: async () => {},
      getContexts: async () => [],
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      onMessage: {
        addListener: (fn: Listener) => {
          listener = fn;
        },
      },
      onInstalled: { addListener: () => {} },
    },
    storage: {
      session: {
        get: async (key: string) => {
          await read;
          return key in session ? { [key]: structuredClone(session[key]) } : {};
        },
        set: async (items: Record<string, unknown>) => {
          writes.push(structuredClone(items));
          Object.assign(session, structuredClone(items));
        },
      },
      local: { get: async () => ({}), set: async () => {} },
    },
    offscreen: {
      createDocument: async () => {},
      closeDocument: async () => {},
      Reason: { USER_MEDIA: "USER_MEDIA", AUDIO_PLAYBACK: "AUDIO_PLAYBACK" },
    },
    sidePanel: { open: async () => {}, setPanelBehavior: async () => {} },
    contextMenus: { create: () => {}, onClicked: { addListener: () => {} } },
  });
  vi.resetModules();
  await import("./service-worker");
}

/** Delivers a message as Chrome would: what the listener returned, and its answer. */
function deliver(msg: unknown, sender: Sender = SIDE_PANEL) {
  let answer: (value: unknown) => void = () => {};
  const answered = new Promise<unknown>((resolve) => {
    answer = resolve;
  });
  const keepsChannelOpen = listener(msg, sender, answer);
  return { keepsChannelOpen, answered };
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const stored = () => session[CALL_SNAPSHOT_KEY] as CallSnapshotMsg;

const LIVE: CallSnapshotMsg = {
  type: MessageType.CallSnapshot,
  state: "active",
  destination: "+34600111222",
  contact: { id: "contact-1", name: "Laura Gómez" },
  callId: "call-1",
  startedAt: 1_000,
  userId: "user_1",
};

beforeEach(() => {
  auth.userId = "user_1";
  auth.orgId = "org_1";
  auth.tokenRequests = [];
});

afterEach(() => vi.unstubAllGlobals());

describe("service worker — REQUEST_AUTH_TOKEN", () => {
  it("never hands a token to a content script", async () => {
    await wakeWorker();
    const answer = vi.fn();

    const keepsChannelOpen = listener(
      { type: MessageType.RequestAuthToken },
      CONTENT_SCRIPT,
      answer,
    );
    await flush();

    expect(keepsChannelOpen).toBe(false);
    expect(answer).not.toHaveBeenCalled();
    expect(auth.tokenRequests).toEqual([]);
  });

  it("answers the side panel with a token minted for it, and whose it is", async () => {
    await wakeWorker();

    const { keepsChannelOpen, answered } = deliver({
      type: MessageType.RequestAuthToken,
    });

    expect(keepsChannelOpen).toBe(true);
    await expect(answered).resolves.toEqual({
      token: "minted-token",
      userId: "user_1",
      orgId: "org_1",
    });
    expect(auth.tokenRequests).toEqual([{ skipCache: true }]);
  });

  it("answers no token when no one is signed in", async () => {
    auth.userId = null;
    await wakeWorker();

    await expect(
      deliver({ type: MessageType.RequestAuthToken }).answered,
    ).resolves.toEqual({ token: null });
  });
});

describe("service worker — woken mid-call", () => {
  // The 2026-11-05 wrap-up: an end handled before the snapshot was read back
  // would land on an empty one, and the wrap-up would lose its contact.
  it("applies the call's end to the call it reads back, not before", async () => {
    await wakeWorker({ stored: LIVE, holdRead: true });

    deliver(
      {
        type: MessageType.CallEvent,
        state: "ended",
        detail: { telnyxSessionId: "telnyx-session-1" },
      },
      OFFSCREEN,
    );
    await flush();
    expect(writes).toEqual([]);

    releaseRead();
    await flush();
    expect(stored()).toMatchObject({
      state: "ended",
      contact: LIVE.contact,
      callId: "call-1",
      startedAt: 1_000,
      telnyxSessionId: "telnyx-session-1",
    });
    expect(stored().endedAt).toEqual(expect.any(Number));
  });

  it("forgets a dial the backend was still authorizing", async () => {
    await wakeWorker({
      stored: {
        type: MessageType.CallSnapshot,
        state: "requesting",
        destination: "+34600333444",
      },
    });

    const answer = (await deliver({ type: MessageType.RequestSnapshot })
      .answered) as CallSnapshotMsg;

    expect(answer.state).toBe("idle");
    expect(answer.destination).toBeUndefined();
    expect(stored().state).toBe("idle");
  });
});

describe("service worker — a finished call's wrap-up", () => {
  const ENDED: CallSnapshotMsg = { ...LIVE, state: "ended", endedAt: 61_000 };

  it("goes back to the user who placed the call", async () => {
    await wakeWorker({ stored: ENDED });

    const { keepsChannelOpen, answered } = deliver({
      type: MessageType.RequestSnapshot,
    });

    expect(keepsChannelOpen).toBe(true);
    await expect(answered).resolves.toMatchObject({
      state: "ended",
      contact: ENDED.contact,
      endedAt: 61_000,
    });
  });

  it("is forgotten once someone else is signed in, or no one is", async () => {
    for (const userId of ["user_2", null]) {
      auth.userId = userId;
      await wakeWorker({ stored: ENDED });

      const answer = (await deliver({ type: MessageType.RequestSnapshot })
        .answered) as CallSnapshotMsg;

      expect(answer.state).toBe("idle");
      expect(answer.contact).toBeUndefined();
      expect(stored().state).toBe("idle");
      expect(stored().contact).toBeUndefined();
    }
  });
});
