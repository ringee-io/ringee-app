import { describe, expect, it, vi } from "vitest";
import {
  MessageType,
  type CallSnapshotMsg,
} from "@ringee/dialer-core/contracts";
import {
  CALL_SNAPSHOT_KEY,
  createCallSnapshotStore,
  type SnapshotStorage,
} from "./call-snapshot";
import { callEventSnapshotPatch } from "./call-flow";

/** An in-memory stand-in for `chrome.storage.session`. */
function sessionStorage(initial: Record<string, unknown> = {}) {
  const items: Record<string, unknown> = { ...initial };
  const storage: SnapshotStorage = {
    get: vi.fn(async (key: string) =>
      key in items ? { [key]: structuredClone(items[key]) } : {},
    ),
    set: vi.fn(async (next: Record<string, unknown>) => {
      Object.assign(items, structuredClone(next));
    }),
  };
  return { storage, items };
}

const contact = { id: "contact-1", name: "Laura Gómez" };

describe("createCallSnapshotStore", () => {
  it("starts with no call", async () => {
    const store = createCallSnapshotStore(sessionStorage().storage, () => {});
    await store.restored;

    expect(store.current).toEqual({
      type: MessageType.CallSnapshot,
      state: "idle",
    });
  });

  it("stores and broadcasts every update", async () => {
    const { storage, items } = sessionStorage();
    const broadcast = vi.fn();
    const store = createCallSnapshotStore(storage, broadcast);
    await store.restored;

    const next = store.update({
      state: "connecting",
      destination: "+34600111222",
      contact,
      startedAt: 1_000,
    });

    expect(next).toMatchObject({ state: "connecting", contact });
    expect(broadcast).toHaveBeenCalledWith(next);
    await Promise.resolve();
    expect(items[CALL_SNAPSHOT_KEY]).toEqual(next);
  });

  // The 2026-11-05 wrap-up: a call longer than ~30 s outlived the worker that
  // placed it, and the worker its end woke up had lost the contact.
  it("keeps the call's contact across a worker restart", async () => {
    const { storage } = sessionStorage();
    const placing = createCallSnapshotStore(storage, () => {});
    await placing.restored;
    placing.update({
      state: "connecting",
      destination: "+34600111222",
      contact,
      callId: "call-1",
      startedAt: 1_000,
    });
    placing.update({ state: "active" });
    await Promise.resolve();

    // Chrome stopped that worker; the engine's "ended" wakes a new one.
    const woken = createCallSnapshotStore(storage, () => {});
    await woken.restored;
    const ended = woken.update(
      callEventSnapshotPatch(woken.current, {
        type: MessageType.CallEvent,
        state: "ended",
        detail: { telnyxSessionId: "telnyx-session-1" },
      }),
    );

    expect(ended).toMatchObject({
      state: "ended",
      contact,
      callId: "call-1",
      startedAt: 1_000,
      telnyxSessionId: "telnyx-session-1",
    });
  });

  it("never puts a stored snapshot over one written meanwhile", async () => {
    let release: () => void = () => {};
    const stored: CallSnapshotMsg = {
      type: MessageType.CallSnapshot,
      state: "ended",
      contact,
    };
    const storage: SnapshotStorage = {
      get: () =>
        new Promise((resolve) => {
          release = () => resolve({ [CALL_SNAPSHOT_KEY]: stored });
        }),
      set: async () => {},
    };
    const store = createCallSnapshotStore(storage, () => {});

    store.update({ state: "requesting", destination: "+34600333444" });
    release();
    await store.restored;

    expect(store.current).toMatchObject({
      state: "requesting",
      destination: "+34600333444",
    });
    expect(store.current.contact).toBeUndefined();
  });

  it("ignores a stored value that is not a snapshot", async () => {
    const { storage } = sessionStorage({
      [CALL_SNAPSHOT_KEY]: { state: "active" },
    });
    const store = createCallSnapshotStore(storage, () => {});
    await store.restored;

    expect(store.current.state).toBe("idle");
  });

  it("works from memory when the storage fails or is missing", async () => {
    const broadcast = vi.fn();
    const failing: SnapshotStorage = {
      get: async () => {
        throw new Error("storage unavailable");
      },
      set: async () => {
        throw new Error("storage unavailable");
      },
    };

    for (const storage of [failing, undefined]) {
      const store = createCallSnapshotStore(storage, broadcast);
      await expect(store.restored).resolves.toBeUndefined();
      expect(store.update({ state: "ringing" }).state).toBe("ringing");
    }
    expect(broadcast).toHaveBeenCalledTimes(2);
  });
});
