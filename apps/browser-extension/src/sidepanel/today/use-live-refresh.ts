import { useEffect } from "react";

/**
 * Runs `refresh` now, whenever the panel comes back into view and — given
 * `everyMs` — on that beat while it is visible.
 */
export function useLiveRefresh(
  refresh: () => Promise<void> | void,
  everyMs?: number,
) {
  useEffect(() => {
    void refresh();
    const timer = everyMs
      ? window.setInterval(() => {
          if (!document.hidden) void refresh();
        }, everyMs)
      : undefined;
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, everyMs]);
}
