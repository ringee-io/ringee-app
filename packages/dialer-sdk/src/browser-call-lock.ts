/**
 * Guarantees a single active call per agent, even across multiple browser tabs.
 *
 * Uses the Web Locks API (which is inherently cross-tab) when available: the
 * lock is held for the whole call and released on hangup / failure / destroy.
 * When Web Locks is unavailable it degrades to a same-tab in-memory flag — still
 * correct within one tab. The lock name is scoped by integration + agent.
 */
export class BrowserCallLock {
  private release: (() => void) | null = null;
  private heldInMemory = false;

  constructor(private readonly name: string) {}

  private get locks(): LockManager | null {
    try {
      if (typeof navigator !== "undefined" && "locks" in navigator) {
        return (navigator as Navigator & { locks: LockManager }).locks;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /** Try to take the lock. Returns false if another tab already holds it. */
  async acquire(): Promise<boolean> {
    const locks = this.locks;
    if (!locks) {
      if (this.heldInMemory) return false;
      this.heldInMemory = true;
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      // `ifAvailable` → callback is invoked with `null` when already held.
      void locks
        .request(this.name, { ifAvailable: true }, (lock) => {
          if (!lock) {
            if (!settled) {
              settled = true;
              resolve(false);
            }
            return undefined;
          }
          // Hold the lock until release() is called.
          return new Promise<void>((releaseLock) => {
            this.release = releaseLock;
            if (!settled) {
              settled = true;
              resolve(true);
            }
          });
        })
        .catch(() => {
          if (!settled) {
            settled = true;
            resolve(true); // fail open rather than block the only tab
          }
        });
    });
  }

  /** Release the lock (idempotent). */
  free(): void {
    this.heldInMemory = false;
    const release = this.release;
    this.release = null;
    if (release) {
      try {
        release();
      } catch {
        /* ignore */
      }
    }
  }
}
