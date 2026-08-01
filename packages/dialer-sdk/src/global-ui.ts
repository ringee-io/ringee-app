/**
 * CDN/global entry with the UI bundled. Exposes `window.Ringee` with both the
 * headless factory and the turnkey UIs, so a CRM can embed a full dialer with a
 * single `<script>` tag and one call:
 *
 *   <script src="https://unpkg.com/@ringee-io/dialer-sdk"></script>
 *   <script>
 *     Ringee.createFloating({ key: "pk_live_…" });
 *   </script>
 */
import { RingeeDialer } from "./ringee-dialer";
import { RingeeError } from "./errors";
import type { RingeeDialerOptions } from "./types";
import {
  createFloating,
  createBar,
  type FloatingOptions,
  type BarOptions,
} from "./ui/factory";

export function create(options: RingeeDialerOptions): RingeeDialer {
  return new RingeeDialer(options);
}

/** Alias so `Ringee.mount(...)` reads naturally for the common floating case. */
export function mount(options: FloatingOptions) {
  return createFloating(options);
}

export { createFloating, createBar, RingeeDialer, RingeeError };
export type { FloatingOptions, BarOptions };
