/**
 * Persists ONLY the Ringee agent session token, and only in `sessionStorage`
 * (survives a reload within the same browser session, gone when the tab
 * closes). The Telnyx credential is NEVER persisted — it lives in memory and is
 * re-minted on restore. The storage key is scoped by integration + origin so
 * two Ringee installs on the same page can't read each other's session.
 */
export class SessionManager {
  private integrationId: string | null = null;
  private origin: string | null = null;

  bind(integrationId: string, origin: string): void {
    this.integrationId = integrationId;
    this.origin = origin;
  }

  private key(): string | null {
    if (!this.integrationId || !this.origin) return null;
    return `ringee:sdk-session:${this.integrationId}:${this.origin}`;
  }

  private store(): Storage | null {
    try {
      if (typeof window === "undefined" || !window.sessionStorage) return null;
      return window.sessionStorage;
    } catch {
      // Access can throw in sandboxed iframes with storage disabled.
      return null;
    }
  }

  save(token: string): void {
    const key = this.key();
    const store = this.store();
    if (!key || !store) return;
    try {
      store.setItem(key, token);
    } catch {
      /* quota / disabled — non-fatal, session just won't survive reload */
    }
  }

  load(): string | null {
    const key = this.key();
    const store = this.store();
    if (!key || !store) return null;
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  }

  clear(): void {
    const key = this.key();
    const store = this.store();
    if (!key || !store) return;
    try {
      store.removeItem(key);
    } catch {
      /* non-fatal */
    }
  }
}
