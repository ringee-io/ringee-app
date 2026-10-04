/**
 * Fired in this tab whenever the workspace's dispositions change, so anything
 * holding a copy — the dialer's post-call buttons — drops it. A leaf module:
 * the dashboard shell imports it without pulling in the settings pane.
 */
export const DISPOSITIONS_CHANGED_EVENT = 'ringee:dispositions-changed';

export function announceDispositionsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DISPOSITIONS_CHANGED_EVENT));
}
