/**
 * The call snapshot the background worker owns and the side panel renders.
 *
 * Chrome stops an extension service worker after ~30 s without an event, and
 * the offscreen engine reports only state changes, so a call longer than about
 * half a minute outlives the worker that placed it. The worker that the call's
 * end then wakes up started from an empty snapshot: the wrap-up showed
 * "Unknown · 0:00", without the contact it needs to schedule a callback or
 * book a meeting (2026-11-05). The snapshot is therefore mirrored into
 * `chrome.storage.session`, which outlives the worker and is cleared with the
 * browser session, and a new worker reads it back before acting on a message.
 */
import {
  MessageType,
  isCallSnapshot,
  type CallSnapshotMsg,
} from "@ringee/dialer-core/contracts";

export const CALL_SNAPSHOT_KEY = "ringee:callSnapshot";

/** The slice of `chrome.storage.session` the store uses. */
export interface SnapshotStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export type SnapshotPatch = Partial<Omit<CallSnapshotMsg, "type">>;

export interface CallSnapshotStore {
  /** The current snapshot; the stored one once `restored` has settled. */
  readonly current: CallSnapshotMsg;
  /** Settles once the stored snapshot was read back (or found missing). */
  readonly restored: Promise<void>;
  /** Merges `patch` in, stores the result and broadcasts it. */
  update(patch: SnapshotPatch): CallSnapshotMsg;
}

export function createCallSnapshotStore(
  storage: SnapshotStorage | undefined,
  broadcast: (snapshot: CallSnapshotMsg) => void,
): CallSnapshotStore {
  let current: CallSnapshotMsg = {
    type: MessageType.CallSnapshot,
    state: "idle",
  };
  // A snapshot this worker wrote is newer than the stored one: a read that
  // settles after it must not put the previous call back.
  let written = false;

  const restored = (async () => {
    try {
      const stored = await storage?.get(CALL_SNAPSHOT_KEY);
      const saved = stored?.[CALL_SNAPSHOT_KEY];
      if (!written && isCallSnapshot(saved)) current = saved;
    } catch {
      // No stored snapshot is the state a new browser session starts in.
    }
  })();

  return {
    get current() {
      return current;
    },
    restored,
    update(patch) {
      current = { ...current, ...patch, type: MessageType.CallSnapshot };
      written = true;
      try {
        void storage?.set({ [CALL_SNAPSHOT_KEY]: current }).catch(() => {});
      } catch {
        // Not stored: this worker still holds it, and the panel gets it below.
      }
      broadcast(current);
      return current;
    },
  };
}
